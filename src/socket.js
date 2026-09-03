const { Server } = require("socket.io");
const Conversation = require("./models/Conversation");
const Property = require("./models/Property");
const User = require("./models/User");
const { verifyAccessToken } = require("./utils/security");

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
    socket.join(`user:${socket.user._id}`);
    socket.on("conversation:join", async (conversationId, acknowledge) => {
      if (!/^[a-f\d]{24}$/i.test(String(conversationId))) return acknowledge?.({ ok: false });
      const allowed = await Conversation.exists({ _id: conversationId, participants: socket.user._id });
      if (!allowed) return acknowledge?.({ ok: false });
      socket.join(`conversation:${conversationId}`);
      return acknowledge?.({ ok: true });
    });
    socket.on("property:join", async (propertyId, acknowledge) => {
      if (!/^[a-f\d]{24}$/i.test(String(propertyId))) return acknowledge?.({ok: false});
      const allowed = await Property.exists({_id: propertyId, status: {$in: ["ACTIVE", "RESERVED", "RENTED"]}, deletedAt: null});
      if (!allowed) return acknowledge?.({ok: false});
      socket.join(`property:${propertyId}`);
      return acknowledge?.({ok: true});
    });
    socket.on("property:leave", (propertyId) => socket.leave(`property:${propertyId}`));
  });

  app.set("io", io);
  return io;
};

module.exports = { attachSocket };
