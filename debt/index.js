'use strict';

var fs = require('fs'),
  lfmt = require('lfmt');

var saveFile = process.cwd() + '/saved.debt';

var debts = [];

var errMsgs = {
  incorrectUsage: '`debt`: you did something wrong.'
};

var loadDebts = function loadMacros() {
  if (debts.length > 0) return;

  try {
    var rawDebts = fs.readFileSync(saveFile).toString()
      .split('\n')
      .forEach(function (record) {
        if (!record) return;

        var items = record.split(' '),
          debtor = items[0],
          creditor = items[1],
          amount = parseInt(items[2]);

        if (!amount) {
          console.log('data file corrupt! aborting load procedure.');
          debts = [];
          return;
        }

        var debt = {
          debtor: debtor,
          creditor: creditor,
          amount: amount
        };

        debts.push(debt);

        console.log(lfmt.format('loading debt from {{debtor}} to {{creditor}} of {{amount}}', debt));
      });
  } catch (err) {
    // log the error and clean the debts.
    console.error(err);
    debts = [];
  }
};

var addDebt = function addDebt(debtor, creditor, amount, cb) {
  var debt = {
    debtor: debtor,
    creditor: creditor,
    amount: amount
  };

  if (!debts.some(function (debt) {
    if (debt.debtor === debtor && debt.creditor === creditor) {
      debt.amount += amount;
      return true;
    } else {
      return false;
    }
  })) {
    debts.push(debt);
  }

  reduceDebts(debtor);
  reduceDebts(creditor);

  var data = '';

  debts.forEach(function (record) {
    data += lfmt.format('{{debtor}} {{creditor}} {{amount}}\n', record)
  });

  fs.writeFile(
    saveFile,
    data,
    function(err) {
      if (err) console.error(err);
      cb && cb();
    }
  );
};

var showDebt = function loadMacros(user) {
  var response = '';
  if (user) {
    var userDebts = [],
      userCredits = [];
    debts.forEach(function (debt) {
      if (debt.debtor === user) {
        userDebts.push(debt);
      } else if (debt.creditor === user) {
        userCredits.push(debt);
      }
    });
    if (userDebts.length > 0) {
      userDebts.sort(function (debt) {return debt.creditor;});
      response += lfmt.format('{{user}}\'s debts:\n', {user: user});
      userDebts.forEach(function (debt) {
        response += lfmt.format('  {{creditor}}: `{{amount}}`\n', debt);
      });
    }
    if (userCredits.length > 0) {
      userCredits.sort(function (debt) {return debt.debtor;});
      response += lfmt.format('{{user}}\'s credits:\n', {user: user});
      userCredits.forEach(function (debt) {
        response += lfmt.format('  {{debtor}}: `{{amount}}`\n', debt);
      });
    }
    return response || lfmt.format('Could not find debts involving: {{user}}.', {user: user});
  } else {
    if (debts) {
      response += 'Showing all debts:\n';
      var sortedDebts = debts.slice().sort(function (debt) {return debt.debtor;}).forEach(function (debt) {
        response += lfmt.format('  {{debtor}} -> {{creditor}}: {{amount}}\n', debt);
      });
    }
    return response || 'No debts have yet been added.';
  }
};

var reduceDebts = function reduceDebts(user) {
  var userDebts = [],
    userCredits = [];
  debts.some(function (debt, index) {
    if (debt.debtor === user) {
      userDebts.push(index);
    } else if (debt.creditor === user) {
      userCredits.push(index);
    }
    return userDebts.length > 0 && userCredits.length > 0;
  });
  while (userDebts.length > 0 && userCredits.length > 0) {
    var amount = Math.min(debts[userCredits[0]].amount, debts[userDebts[0]].amount);

    if (debts[userCredits[0]].debtor !== debts[userDebts[0]].creditor) {
      debts.push({
        debtor: debts[userCredits[0]].debtor,
        creditor: debts[userDebts[0]].creditor,
        amount: amount
      });
    }

    var laterDebt = Math.max(userCredits[0], userDebts[0]),
      earlierDebt = Math.min(userCredits[0], userDebts[0]);

    if (debts[laterDebt].amount === amount) {
      debts.splice(laterDebt, 1);
    } else {
      debts[laterDebt].amount -= amount;
    }

    if (debts[earlierDebt].amount === amount) {
      debts.splice(earlierDebt, 1);
    } else {
      debts[earlierDebt].amount -= amount;
    }

    userDebts = [];
    userCredits = [];
    debts.some(function (debt, index) {
      if (debt.debtor === user) {
        userDebts.push(index);
      } else if (debt.creditor === user) {
        userCredits.push(index);
      }
      return userDebts.length > 0 && userCredits.length > 0;
    });
  }
};

var debt = function debt(argv, response, logger) {
  loadDebts();

  if (argv.length < 2) {
    logger.error('`debt` called incorrectly: ', argv);
    response.end(errMsgs.incorrectUsage);
    return;
  }

  var subcmd = argv[1];

  if (subcmd === 'add') {
    var debtor = argv[2],
      creditor = argv[3],
      amount = parseInt(argv[4]);

    if (!debtor || !creditor || !amount) {
      logger.error('`debt` called incorrectly: ', argv);
      response.end(errMsgs.incorrectUsage);
      return;
    }

    addDebt(debtor, creditor, amount, function(err) {
      if (!err) {
        response.end(lfmt.format('Successfully added debt from {{debtor}} to {{creditor}} of {{amount}}`', {
          debtor: debtor,
          creditor: creditor,
          amount: amount
        }));
      }
    });
  } else if (subcmd === 'all') {
    response.end(showDebt());
  } else {
    response.end(showDebt(subcmd));
  }
};

debt.metadata = {
  name: 'debt',
  command: 'debt',
  info: {
    description: 'record a debt',
    usage: 'debt [add {debtor} {creditor} {amount}|{debtor}|{creditor}|all]'
  }
};

module.exports = debt;
