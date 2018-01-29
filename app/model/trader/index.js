'use strict';

const config = require('../../../config');
const Exchange = require('../base/exchange');
const Portfolio = require('../base/portfolio');
const xu = require('../../util/exchange');
const strat = require('../strategy');
const mkdirp = require("mkdirp");
const fs = require("fs");
const dateFormat = require('dateformat');

class Trader {
  constructor(filepath) {
    this.filepath = filepath;
  }

  async init(params) {
    const json = JSON.parse(fs.readFileSync(this.filepath));
    if (params.backtest) {
      let scenario = JSON.parse(fs.readFileSync(params.backtest));
      config.backtest = true;
      config.scenario = scenario;
      config.dateID = scenario.date_id;
      config.record = false; // don't let recording happen if we're backtesting
    } else {
      config.dateID = xu.DATE_ID;
      config.record = json.record;
    }
    if (json.record) {
      // make sure we have directories setup if we're going to record
      mkdirp.sync(`./data/${json.exchange}/${config.dateID}`);
    }
    this.strategies = json.strategies.map((strat) => {
      let stratClass = require(`../strategy/${strat.id}`);
      return new stratClass(strat.params, strat.weight);
    });
    let api = xu.getExchange(json.exchange);
    this.exchange = await Exchange.FromAPI(api);
    this.executionRate = json.executionRate;
    this.fundSymbol = params.symbol;
    this.fundAmount = params.amount;
    this.feed = this.exchange.feed;
    this.exchange.addTickers(json.tickers, json.candles);
    this.exchange.time = config.scenario.start;
    this.initStrategies();
  }

  initStrategies() {
    const sum = this.sumWeight();
    // this normalizes the weights in all provided strategies and
    // divvies up the trader's total funds accordingly
    this.strategies.forEach((strategy) => {
      const amount = this.fundAmount * strategy.weight / sum;
      if (amount > 0) {
        strategy.register(this.fundSymbol, amount, this.consider.bind(this), this.feed);
        strategy.portfolio = new Portfolio(this.exchange);
        strategy.portfolio.add(this.fundSymbol, amount);
        strategy.initSignals(this.feed);
      }
    });
  }


  async run() {
    this.feed.run();
    while (true) {
      if (this.exchange.dirty) {
        this.strategies.forEach((strategy) => strategy.tick());
        this.exchange.dirty = false;
        this.printPerformance();
      }

      if (this.exchange.isBacktesting()) {
        this.exchange.time += 1000; // add one second per tick in backtest mode
        if (this.exchange.time > config.scenario.end) {
          await xu.sleep(1000); // let everything wrap up!
          console.log("Ended backtest");
          process.exit();
        }
      }
      await xu.sleep(10);
    }
  }


  async consider(strategy, orderRequest) {
    let portfolio = strategy.portfolio;
    if (orderRequest.type == strat.REQ_LIMIT_BUY) {
      if (portfolio.canAffordBuy(orderRequest)) {
        let market = this.exchange.sym(orderRequest.market);
        portfolio.buy(market, orderRequest.amount, orderRequest.cost());
      }
    } else if (orderRequest.type == strat.REQ_LIMIT_SELL) {
      if (portfolio.canAffordSell(orderRequest)) {
        let market = this.exchange.sym(orderRequest.market);
        portfolio.sell(market, orderRequest.amount, orderRequest.cost());
      }
    }
  }


  serialize() {
    let json = {
      exchange: this.api.name.toLowerCase(),
      name: this.name,
      strategies: this.strategies.map((strat) => strat.serialize()),
      tickers: Object.keys(this.feed.tickers),
      candles: Object.keys(this.feed.candles),
      executionRate: this.executionRate,
      record: config.record
    };
    return JSON.stringify(json);
  }


  static async deserialize(filepath, params) {
    let trader = new Trader(filepath);
    await trader.init(params);
    return trader;
  }


  sumWeight() {
    return this.strategies.reduce((mem, strategy) => mem + strategy.weight, 0);
  }


  async printPerformance() {
    if (this.strategies.length == 0) return;
    console.log('\x1Bc');
    if (this.exchange.isBacktesting()) {
      let dateStart = dateFormat(config.scenario.start, "mmm d, h:MM:ssTT");
      let dateEnd = dateFormat(config.scenario.end, "mmm d, h:MM:ssTT");
      console.log(`Backtesting from ${dateStart} to ${dateEnd}\n`);
    }
    for (var i = 0; i < this.strategies.length; i++) {
      let strategy = this.strategies[i];
      try {
        let value = await strategy.portfolio.value("USDT");
        console.log(" |=> " + strategy.title + ": $" + value.total.toFixed(2));
      } catch(err) {
        throw err;
        console.log("Error calculating value");
      }
    }
    console.log("\n");
  }
}

module.exports = Trader;