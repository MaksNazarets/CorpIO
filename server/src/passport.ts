import {
  ExtractJwt,
  Strategy as JwtStrategy,
  StrategyOptions,
} from "passport-jwt";
import { User } from "./entity/User";

const jwtOpts: StrategyOptions = {
  jwtFromRequest: ExtractJwt.fromExtractors([
    ExtractJwt.fromAuthHeaderAsBearerToken(),
    (req) => {
      return req.cookies.jwtToken;
    },
  ]),
  secretOrKey: process.env.JWT_SECRET,
  // expiresIn: "1y", // specified in userController
};

export const jwtStrategy = new JwtStrategy(
  jwtOpts,
  async (jwtPayload, done) => {
    try {
      const user = await User.findOne({
        where: { id: jwtPayload.sub },
        relations: {
          department: true,
          headOf: true,
        },
      });

      if (!user) {
        console.log("User not found");
        return done(null, false, { message: "User not found" });
      }

      return done(null, user);
    } catch (error) {
      return done(error, false, { message: "An error occurred" });
    }
  }
);
