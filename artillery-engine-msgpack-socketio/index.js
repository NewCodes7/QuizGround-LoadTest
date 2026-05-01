const SocketIoEngine = require('@artilleryio/int-core/lib/engine_socketio');
const msgpackParser = require('socket.io-msgpack-parser');
const io = require('socket.io-client');
const wildcardPatch = require('socketio-wildcard')(io.Manager);
const _ = require('lodash');
const engineUtil = require('@artilleryio/int-commons').engine_util;
const template = engineUtil.template;

function MsgpackSocketIOEngine(script) {
  SocketIoEngine.call(this, script);
}

MsgpackSocketIOEngine.prototype = Object.create(SocketIoEngine.prototype);
MsgpackSocketIOEngine.prototype.constructor = MsgpackSocketIOEngine;

MsgpackSocketIOEngine.prototype.loadContextSocket = function (namespace, context, cb) {
  context.sockets = context.sockets || {};

  if (!context.sockets[namespace]) {
    const target = this.config.target + namespace;
    const tls = this.config.tls || {};

    const socketioOpts = template(this.socketioOpts, context);
    const options = _.extend({}, socketioOpts, tls, { parser: msgpackParser });

    const socket = io(target, options);
    context.sockets[namespace] = socket;

    wildcardPatch(socket);

    socket.on('*', () => {
      context.__receivedMessageCount++;
    });

    socket.once('connect', () => {
      cb(null, socket);
    });
    socket.once('connect_error', (err) => {
      cb(err, null);
    });
    socket.once('error', (err) => {
      cb(err, socket);
    });
  } else {
    return cb(null, context.sockets[namespace]);
  }
};

module.exports = MsgpackSocketIOEngine;
