'use strict';

let util = require('./lib/util');
let Splitwise = require('splitwise')
let imgur = require('imgur');
let graphviz = require('graphviz');
let fs = require('fs');

let sw = null;
let _logger = null;
let swIdMap = null;  // a map of slack id => splitwise id

let addDebt = (from, to, amount, config, cb) => {

}

let listDebts = (target, fromOrTo, config, cb) => {
  let swTargetId = swIdMap[target.id]
  if (typeof swTargetId === 'undefined') {
    _logger.error(`User id ${target.id} (${target.name}) doesn't match anyone`);
  }

  sw.getGroup((error, data, _) => {
    if (error) {
      _logger.error(`Splitwise API error ${JSON.stringify(error)}`);
      return;
    }

    let groupData = data.group;

    // let debits = group.original_debts
    //   .filter(entry => entry.from == swTargetId)
    //   .map(entry => `${util.formatDebtLabel(entry, config.defaultCurrencyCode)} to ${entry.to}`)

    let credits = group.original_debts
      .filter(entry => entry.to == swTargetId)
      .map(entry => `${util.formatDebtLabel(entry, config.defaultCurrencyCode)} from ${entry.from}`)

    let formattedOutput = [util.listFormat(debits), util.listFormat(credits)].join();

    cb(formattedOutput);
  });
};

let getBalance = (target, config, cb) => {
  sw.getGroup().then(groupData => {
    if (!config.swIdMap[target.id]) {
      cb(null, `I don't know who ${target.real_name} is on Splitwise!`);
    }

    let memberData = groupData.members
      .find(member => member.id === config.swIdMap[target.id]);

    if (memberData) {
      let processBalance = (bal) => {
        return {
          amount: util.parseAmount(bal.amount),
          currency: bal.currency_code
        };
      };
      let processedBalances = memberData.balance.map(processBalance);

      let result = {
        owes: processedBalances.filter(bal => bal.amount < 0),
        owed: processedBalances.filter(bal => bal.amount > 0)
      };

      cb(result);
    }
  }).catch(error => {
    _logger.error(`Splitwise API error ${JSON.stringify(error)}`);
  });
}

let graphDebts = (fullGraph, config, cb) => {
  sw.getGroup().then(groupData => {
    let graphConfig = config.graph || {};

    let groupMembers = {};
    let balanceGraph = graphviz.digraph('Debts');
    balanceGraph.set('layout', fullGraph ? 'dot' : 'neato');
    balanceGraph.set('overlap', 'scale');

    groupData.members.forEach(member => {
      member.fullName = util.formatName(member);



      groupMembers[member.id] = member.fullName;
      let graphNode  = balanceGraph.addNode(`${member.id}`, {
        label: member.fullName
      });
      graphNode.set('color', util.getBalanceColor(
        graphConfig.nodeColors, member.balance));
      graphNode.set('fontname', graphConfig.fontname);
      member.graphNode = graphNode;
    });

    (fullGraph ? groupData.original_debts : groupData.simplified_debts)
      .forEach(debt => {
        let edge = balanceGraph.addEdge(`${debt.from}`, `${debt.to}`, {
          label: util.formatAmount(debt.amount, debt.currency_code,
            config.currencies)
        });
        edge.set('color',
          util.getCurrencyColor(config.currencies, debt.currency_code));
        edge.set('penwidth', util.getEdgeWidth(debt.amount));
        edge.set('fontname', graphConfig.fontname);
      });

    let imgPath = `/tmp/balanceGraph${Date.now()}.png`;
    balanceGraph.output('png', (rendered) => {
      fs.writeFile(imgPath, rendered, () => {
        imgur.uploadFile(imgPath)
          .then(res => cb(res.data.link))
          .catch(error => {
            _logger.error(`Error uploading splitwise graph to imgur: ${error.message}`);
          });
      });
    });
  }).catch(error => {
    _logger.error(`Splitwise API error ${JSON.stringify(error)}`);
  });
};

let slackwise = (user, users, argv, config, logger, response, helpService) => {
  let cmdname = argv.shift();
  let subcmd = argv.shift();
  if (subcmd === 'graph') {
    let drawFullGraph = !!argv.some(item => item === '--full');
    graphDebts(drawFullGraph, config, imgUrl => response.end(imgUrl));
  }
  else if (subcmd === 'balance' || subcmd === 'bal') {
    let arg = argv.shift();
    let target;

    try {
      target = users[arg ? util.parseUserTag(arg) : user.id];

      if (typeof target === 'undefined') {
        throw 'Don\'t know who this is lol';
      }
    }
    catch (e) {
      response.end(`I don't know who "${arg}" is!`);
      return;
    }

    getBalance(target, config, (balances, err) => {
      if (err) {
        response.end(err);
        return;
      }

      if (balances.owes.length) {
        response.write(`${target.real_name} owes:\n`);
        response.write(balances.owes.map(bal => {
          return `• ${util.formatAmount(-bal.amount, bal.currency,
            config.currencies)}`
        }).join('\n'));
        response.write('\n\n');
      }

      if (balances.owed.length) {
        response.write(`${target.real_name} is owed:\n`);
        response.write(balances.owed.map(bal => {
          return `• ${util.formatAmount(bal.amount, bal.currency,
            config.currencies)}`
        }).join('\n'));
      }

      response.end();
    });
  } else {
    let helpQuery = [cmdname].concat(argv);
    response.end(helpService.getHelpPage(helpQuery));
  }
};

slackwise.setup = (config, logger) => {
  sw = Splitwise({
    consumerKey: config.swConsumerKey,
    consumerSecret: config.swConsumerSecret,
    group_id: config.swGroupId,
  });
  imgur.setClientId(config.imgurClientId);
  _logger = logger;
  swIdMap = config.swIdMap;
};

slackwise.metadata = require('./plugin');
module.exports = slackwise;
