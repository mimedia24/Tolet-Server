const { Server } = require("socket.io");
const Conversation = require("./models/Conversation");
const Message = require("./models/Message");
const Property = require("./models/Property");
const User = require("./models/User");
const { verifyAccessToken } = require("./utils/security");

const connectionCounts = new Map();

const attachSocket = (httpServer, app, allowedOrigins) => {
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins, credentials: true, methods: ["GET", "POST"] },
    transports: ["websocket", "polling"],
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || String(socket.handshake.headers.authorization || "").replace(/^Bearer\s+/i, "");
      const payload = verifyAccessToken(token);
      const user = await User.findById(payload.sub);
      if (!user || user.accountStatus !== "ACTIVE" || !user.phoneVerified || Number(payload.v || 0) !== Number(user.tokenVersion || 0)) return next(new Error("Unauthorized"));
      socket.user = user;
      return next();
    } catch (_error) {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = String(socket.user._id);
    connectionCounts.set(userId, (connectionCounts.get(userId) || 0) + 1);
    socket.join(`user:${userId}`);
    Conversation.find({participants: socket.user._id}).select("participants").lean().then((conversations) => {
      const peers = new Set(conversations.flatMap((item) => item.participants.map(String)).filter((item) => item !== userId));
      for (const peerId of peers) io.to(`user:${peerId}`).emit("presence:update", {userId, online: true, lastSeenAt: new Date()});
    }).catch(() => {});
    socket.on("conversation:join", async (conversationId, acknowledge) => {
      if (!/^[a-f\d]{24}$/i.test(String(conversationId))) return acknowledge?.({ ok: false });
      const conversation = await Conversation.findOne({ _id: conversationId, participants: socket.user._id }).select("participants").lean();
      if (!conversation) return acknowledge?.({ ok: false });
      socket.join(`conversation:${conversationId}`);
      const peerId = conversation.participants.map(String).find((item) => item !== userId);
      if (peerId) socket.emit("presence:update", {userId: peerId, online: Boolean(connectionCounts.get(peerId)), lastSeenAt: new Date()});
      return acknowledge?.({ ok: true });
    });
    socket.on("message:delivered", async (payload = {}, acknowledge) => {
      const messageId = String(payload.messageId || "");
      if (!/^[a-f\d]{24}$/i.test(messageId)) return acknowledge?.({ok: false});
      const message = await Message.findOne({_id: messageId, senderId: {$ne: socket.user._id}});
      if (!message) return acknowledge?.({ok: false});
      const allowed = await Conversation.exists({_id: message.conversationId, participants: socket.user._id});
      if (!allowed) return acknowledge?.({ok: false});
      const deliveredAt = message.deliveredAt || new Date();
      if (!message.deliveredAt) await Message.updateOne({_id: message._id}, {$set: {deliveredAt}});
      io.to(`conversation:${message.conversationId}`).to(`user:${message.senderId}`).emit("message:delivered", {
        conversationId: String(message.conversationId), messageId, deliveredAt,
      });
      return acknowledge?.({ok: true});
    });
    socket.on("typing:update", async (payload = {}) => {
      const conversationId = String(payload.conversationId || "");
      if (!/^[a-f\d]{24}$/i.test(conversationId)) return;
      const conversation = await Conversation.findOne({_id: conversationId, participants: socket.user._id}).select("participants").lean();
      if (!conversation) return;
      const recipientId = conversation.participants.map(String).find((item) => item !== userId);
      if (recipientId) io.to(`user:${recipientId}`).emit("typing:update", {
        conversationId, userId, typing: Boolean(payload.typing),
      });
    });
    socket.on("property:join", async (propertyId, acknowledge) => {
      if (!/^[a-f\d]{24}$/i.test(String(propertyId))) return acknowledge?.({ok: false});
      const allowed = await Property.exists({_id: propertyId, status: {$in: ["ACTIVE", "RESERVED", "RENTED"]}, deletedAt: null});
      if (!allowed) return acknowledge?.({ok: false});
      socket.join(`property:${propertyId}`);
      return acknowledge?.({ok: true});
    });
    socket.on("property:leave", (propertyId) => socket.leave(`property:${propertyId}`));
    socket.on("disconnect", () => {
      const nextCount = Math.max(0, (connectionCounts.get(userId) || 1) - 1);
      if (nextCount) return connectionCounts.set(userId, nextCount);
      connectionCounts.delete(userId);
      Conversation.find({participants: socket.user._id}).select("participants").lean().then((conversations) => {
        const peers = new Set(conversations.flatMap((item) => item.participants.map(String)).filter((item) => item !== userId));
        for (const peerId of peers) io.to(`user:${peerId}`).emit("presence:update", {userId, online: false, lastSeenAt: new Date()});
      }).catch(() => {});
    });
  });

  app.set("io", io);
  return io;
};

module.exports = { attachSocket };
