"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const trader_1 = require("../models/trader");
const commandLineArgs = require("command-line-args");
const rs = require('readline-sync');
const chrono = require('chrono-node');
const fs = require("fs");
const utils_1 = require("../utils");
const backfiller_1 = require("../models/backfiller");
const optionDefinitions = [
    { name: 'help', alias: 'h', type: Boolean },
    { name: 'symbol', alias: 's', type: String, defaultValue: "BTC" },
    { name: 'amount', alias: 'a', type: Number },
    { name: 'trader', alias: 't', type: String, defaultOption: true },
    { name: 'backtest', alias: 'b', type: String },
    { name: 'mock', alias: 'm', type: Boolean, defaultValue: false }
];
const opts = commandLineArgs(optionDefinitions);
(async () => {
    let traderJSON = JSON.parse(fs.readFileSync(opts.trader).toString());
    // if we're asking to backtest without providing a scenario file,
    // we need to go grab the backtest data
    if (opts.backtest === null) {
        let dateInput = rs.question("What time range? (This can be written naturally, e.g. 'Saturday 4pm to Monday 9am'): ");
        let [parsed] = chrono.parse(dateInput);
        let start = parsed.start.date();
        let end = parsed.end.date();
        let name = rs.question("Give this backtest a name (default is data start date): ");
        if (!name || name.length < 1)
            name = utils_1.formatTimestamp(+start);
        const backfiller = new backfiller_1.Backfiller(traderJSON);
        opts.backtest = await backfiller.run(name, +start, +end);
    }
    // don't require explicit mock
    if (!opts.mock && opts.backtest)
        opts.mock = true;
    new trader_1.Trader(traderJSON, opts).run();
})();
//# sourceMappingURL=basic.js.map