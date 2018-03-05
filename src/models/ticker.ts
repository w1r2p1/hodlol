import { Exchange } from "./exchange";
import { Series, Serializer, TickerSerializer, OrderSerializer, OHLCVSerializer } from "./series";
import { sleep, Thread } from "../utils";
import { ID, Scenario, ScenarioMode, Tick, ExchangeState, OHLCVTick, OrderTick, Order, OHLCV } from "./types";

export class Ticker {
  readonly series:Series;
  protected thread:Thread;
  protected timeout:number;
  constructor(protected exchange:Exchange, readonly symbol:string) {
    this.series = new Series(this.filepath(), this.generateSerializer());
    this.thread = new Thread();
    this.timeout = Scenario.getInstance().mode == ScenarioMode.PLAYBACK ? 1 : 5000;
  }
  
  /** 
   * Kicks off the ticker process. This runs asynchronously
  */
  public async run() {
    while (this.thread.isRunning()) {
      await this.step();
      await this.thread.sleep(this.timeout);
    }
  }

  /** 
   * Move one step forward
  */
  public async step() {
    const tick = await this.exchange.fetchTicker(this.symbol);
    this.series.append(tick);
    this.exchange.invalidate();
  }

  /** 
   * Gets the length of the series
   * 
   * @returns series length
  */
  public length():number {
    return this.series.length();
  }

  /**
   * Gets the tick at @idx
   * 
   * @param idx index of tick to grab
   * 
   * @returns tick 
   */
  public getAt(idx:number):Tick<ExchangeState> {
    return this.series.getAt(idx);
  }

  /** 
   * Gets the last tick
   * 
   * @returns the last tick in the series
  */
  public last():Tick<ExchangeState> {
    return this.series.last();
  }

  /** 
   * Kills this ticker (stops its run loop)
  */
  public kill():void {
    this.thread.kill();
  }

  protected filename():string {
    return `${this.symbol.replace("/", "-")}.${this.extension()}`;
  }

  protected subdir():string {
    return Scenario.getInstance().id;
  }

  protected filepath():string {
    return `./${Scenario.getInstance().dataDir()}/${this.exchange.name()}/${this.subdir()}/${this.filename()}`;
  }

  protected extension():string {
    return 'ticker';
  }

  protected generateSerializer():Serializer {
    return new TickerSerializer();
  }

  public seriesFromTicker() {
    return new Series(this.filepath(), this.generateSerializer());
  }
}

export class OHLCVTicker extends Ticker {
  constructor(exchange:Exchange, symbol:string, private period:string="1m") {
    super(exchange, symbol);
    this.timeout = Scenario.getInstance().mode == ScenarioMode.PLAYBACK ? 1 : 35000;
  }

  /** 
   * Grabbing candlestick data returns 0 <= n <= 500 ticks, so we have to iterate over all of them and add each
  */
  public async step() {
    let last:Tick<ExchangeState> = this.last();
    let since:number = last ? last.timestamp : Scenario.getInstance().time;
    const ohlcv:OHLCV[] = await this.exchange.fetchOHLCV(this.symbol, this.period, since);
    ohlcv.forEach((candlestick:OHLCV) => {
      this.series.append(candlestick);
    });
    this.exchange.invalidate();
    if (Scenario.getInstance().record) this.series.write();
  }

  protected extension():string {
    return 'ohlcv';
  }

  protected generateSerializer():Serializer {
    return new OHLCVSerializer();
  }
}

export class OrderTicker extends Ticker {
  readonly orderID:ID;
  constructor(exchange:Exchange, order:Order, readonly portfolioID:ID) {
    super(exchange, order.state.symbol);
    this.orderID = order.state.id;
  }

  public async step() {
    const tick:Order = await this.exchange.fetchOrder(this.orderID, this.symbol);
    if (this.hasChanged(tick)) {
      this.series.append(tick);
      this.exchange.invalidate();
    }
  }

  private hasChanged(tick:Order):boolean {
    let last:Order = this.last() as Order;
    if (!last) return true;
    if (last.state.status != tick.state.status) return true;
    if (last.state.filled != tick.state.filled) return true;
    return false;
  }

  protected extension():string {
    return 'order';
  }

  protected generateSerializer():Serializer {
    return new OrderSerializer();
  }
}