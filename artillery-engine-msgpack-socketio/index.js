'use strict';

// Standalone engine: only uses packages bundled in the Fargate test bundle.
// Avoids requiring Artillery internals (@artilleryio/int-core, int-commons, socketio-wildcard)
// which are not resolvable from the test bundle's node_modules on Fargate workers.

const io = require('socket.io-client');
const msgpackParser = require('socket.io-msgpack-parser');

function resolveEnvVars(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/\{\{\s*\$env\.(\w+)\s*\}\}/g, (_, key) => process.env[key] || '');
}

function MsgpackSocketIOEngine(script) {
  this.config = script.config;
  this.socketioOpts = script.config.socketio || {};
}

MsgpackSocketIOEngine.prototype.createScenario = function (scenarioSpec, ee) {
  const self = this;
  const processor = self.config.processor || {};

  const steps = scenarioSpec.flow
    .filter((step) => step.function)
    .map((step) => {
      const fn = processor[step.function];
      if (!fn) {
        return (context, callback) => {
          ee.emit('error', `Undefined function "${step.function}"`);
          callback(null, context);
        };
      }
      return (context, callback) => fn(context, ee, (err) => callback(err, context));
    });

  return function scenario(initialContext, callback) {
    ee.emit('started');

    const query = resolveEnvVars(self.socketioOpts.query || '');
    const transports = self.socketioOpts.transports || ['websocket'];

    const socket = io(self.config.target, {
      query,
      transports,
      parser: msgpackParser,
    });

    const context = Object.assign({}, initialContext, {
      sockets: { '': socket },
      vars: Object.assign({}, (initialContext && initialContext.vars) || {}),
      __receivedMessageCount: 0,
    });

    // socket.io-client v3+ supports onAny — no socketio-wildcard needed
    socket.onAny(() => {
      context.__receivedMessageCount++;
    });

    socket.once('connect', () => {
      let i = 0;
      function runNext(err) {
        if (err) {
          socket.disconnect();
          ee.emit('error', err.message || String(err));
          return callback(err, context);
        }
        if (i >= steps.length) {
          ee.emit('counter', 'socketio.received_messages', context.__receivedMessageCount);
          socket.disconnect();
          return callback(null, context);
        }
        steps[i++](context, runNext);
      }
      runNext();
    });

    socket.once('connect_error', (err) => {
      ee.emit('error', err.message || String(err));
      return callback(err, context);
    });
  };
};

MsgpackSocketIOEngine.prototype.closeContextSockets = function (context) {
  if (context && context.sockets) {
    Object.values(context.sockets).forEach((socket) => {
      if (socket && typeof socket.disconnect === 'function') {
        socket.disconnect();
      }
    });
  }
};

module.exports = MsgpackSocketIOEngine;
