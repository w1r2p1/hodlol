'use strict';

const Series = require('./series');
const config = require('../../../config');

class MockAPI {
  constructor(feed) {
    this.tickers = {};
    this.candles = {};
    for (var symbol in feed.tickers) {
      this.tickers[symbol] = Series.FromTicker(feed.tickers[symbol]);
    }
    for (var symbol in feed.candles) {
      this.candles[symbol] = Series.FromCandle(feed.candles[symbol]);
    }
  }

  read() {
    let min = Number.MAX_VALUE;
    let max = 0;
    Object.values(this.tickers).forEach((series) => {
      series.read();
      if (series.series[0].timestamp < min) {
        min = series.series[0].timestamp;
      }
      if (series.series[series.series.length-1].timestamp > max) {
        max = series.series[series.series.length-1].timestamp;
      }
    });
    if (config.scenario.start == undefined) {
      config.scenario.start = min;
      config.scenario.end = max;
    }
    Object.values(this.candles).forEach((series) => series.read());
  }

  fetchTicker(pair, time) {
    let series = this.tickers[pair];
    let [last, _] = series.nearest(time);
    return last;
  }

  fetchOHLCV(pair, time) {
    let series = this.candles[pair];
    let [last, _] = series.nearest(time);
    // have to format it as the ticker expects it from CCXT
    return series.serializer.outCCXT(last);
  }
}

module.exports = MockAPI;