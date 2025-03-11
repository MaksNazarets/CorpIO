import cors from "cors";
import "dotenv/config";
import express from "express";
import passport from "passport";
import "reflect-metadata";
import { router as chatRouter } from "./Routes/chatRoute";
import { router as departmentRouter } from "./Routes/departmentRoute";
import { router as projectRouter } from "./Routes/projectRouter";
import { router as statsRouter } from "./Routes/statsRoute";
import { router as userRouter } from "./Routes/userRoute";
import { AppDataSource } from "./data-source";

import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import session from "express-session";
import { createServer } from "http";
import { JsonWebTokenError } from "jsonwebtoken";
import process from "process";
import { Server } from "socket.io";
import { User } from "./entity/User";
import { jwtStrategy } from "./passport";
import handleSockets from "./sockets/socket";

const app = express();

const CLIENT_ORIGINS = [
  "http://localhost:5173",
  "https://maksnazarets.github.io/CorpIO-frontend",
];

app.use(
  cors({
    origin: CLIENT_ORIGINS,
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET as string,
  resave: false,
  saveUninitialized: false,
});

app.use(sessionMiddleware);

app.use(passport.initialize());
app.use(passport.session());

const httpServer = createServer(app);

// socket.io
export const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGINS,
    credentials: true,
  },
});
io.engine.use(sessionMiddleware);
io.engine.use(passport.initialize());
io.engine.use(passport.session());
io.engine.use(cookieParser());

io.use((socket: any, next: any) => {
  passport.authenticate(
    "jwt",
    { session: false },
    (err: JsonWebTokenError, user: User | null) => {
      if (err) {
        console.log("Authentication error:", err);
        return next("Some error occured on the server side");
      }
      if (!user) {
        return next(new Error("Authentication failed."));
      }

      socket.data.user = user;
      return next();
    }
  )(socket.request, socket.request.res, next);
});
// /socket.io

app.use("../uploads", express.static("uploads"));

app.use("/api/users", userRouter);
app.use("/api/departments", departmentRouter);
app.use("/api/chats", chatRouter);
app.use("/api/stats", statsRouter);
app.use("/api/projects", projectRouter);

passport.use(jwtStrategy);

AppDataSource.initialize()
  .then(() => {
    console.log("DB sucessfully initialized");

    const PORT = process.env.PORT || 5000;

    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}...`);

      handleSockets();
    });
  })
  .catch((error) => console.log(error));
