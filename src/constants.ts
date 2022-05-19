import grimPoints from "./models/grim-points";
import grimDepartments from "./models/grim-departments";

function getTimestamp() {
  let now = new Date();

  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds());
}

function stringifyParams(data, action, user) {
  data.action = action;
  data.user = user;

  let keys = Object.keys(data).sort();
  let params = [];

  for (let i in keys) {
    let key = keys[i];
    let value = data[key]

    params.push(key + '=' + (Array.isArray(value) ? value.join(',') : value));
  }

  return params.join('&');
};

export default {
  BASE_POINTS: grimPoints,
  BASE_DEPARTMENTS: grimDepartments,

  POINTS_PER_TIMEPERIOD: 10, // points per day
  BASE_COOLDOWN_CAPACITY: 50,
  COOLDOWN_UNITS: 10,
  PERIOD_PER_TIMEPRIOD: 1, // 1 day per day
  LOCKING_PERIOD: 14, // 14 days
  ONE_LOCKING_PERIOD: (24 * 60 * 60 * 1000), // day in milliseconds

  IN_WALLET: 1,
  IN_WALLET_DELEGATED: 0,
  NOT_IN_WALLET: -1,

  ONE_COOLDOWN_PERIOD: 24 * 60 * 60 * 1000, // (1 day)
  ONE_PENALTY_PERIOD: 24 * 60 * 60 * 1000, // (1 day)
  PENALTY_LENGTH: 7, // (7 days)

  WALLET_CHECK_INTERVAL: 24 * 60 * 60 * 1000, // 1 day

  CANCEL_TRANSACTIONS_INTERVAL: 5 * 60 * 1000, // longer than 5min
  CANCEL_QUEST_INTERVAL: 5 * 60 * 1000, // longer than 5min

  STAMINA_MIN_INTERVAL: 1 * 60 * 60 * 1000, // 1 hour

  COOLDOWN_DAEMON_IMPACT_RATE: 2, /* 2% faster cooldown */
  COOLDOWN_DAEMONS_MAX: 10, /* Max number of daemons in wallet that can have impact */

  VERSION_MESSAGE: 1,
  VERSION_TRANSACTION: 2,

  getTimestamp: getTimestamp,
  stringifyParams: stringifyParams,
  VERSION: 1 /* Keep as last element in the JSON */
}