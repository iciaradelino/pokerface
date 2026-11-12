// A stand-in for an mssql pool that records every query and lets a test decide the answer.
// `handler(text, inputs)` returns what the database would return, or throws to simulate a failure.
const emptyResult = { recordset: [], rowsAffected: [0] };

export function makeRequest(handler, log) {
  const inputs = {};
  const request = {
    input(name, _type, value) {
      inputs[name] = value;
      return request;
    },
    async query(text) {
      log.push({ text, inputs: { ...inputs } });
      return (await handler(text, inputs)) ?? emptyResult;
    },
    async batch(text) {
      log.push({ text, inputs: { ...inputs }, batch: true });
      return (await handler(text, inputs)) ?? emptyResult;
    },
  };
  return request;
}

export function fakePool(handler = () => emptyResult, { rollbackFails = false } = {}) {
  const log = [];
  const events = [];
  const transaction = {
    async begin() {
      events.push('begin');
    },
    async commit() {
      events.push('commit');
    },
    async rollback() {
      events.push('rollback');
      if (rollbackFails) throw new Error('rollback failed');
    },
    request: () => makeRequest(handler, log),
  };
  return {
    log,
    events,
    request: () => makeRequest(handler, log),
    transaction: () => transaction,
  };
}
