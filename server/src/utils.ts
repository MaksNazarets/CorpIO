import bcrypt from "bcrypt";
import { Request } from "express";
import { User } from "./entity/User";
import { Storage } from "@google-cloud/storage";

export const gStorage = new Storage({
  keyFilename: "google-service-account-credentials.json",
});
export const gBucketName = "helical-fin-424413-q2.appspot.com";

export const hashPassword = async (plainTextPassword: string) => {
  try {
    const saltRounds = 10;
    const salt = await bcrypt.genSalt(saltRounds);

    const hashedPassword = await bcrypt.hash(plainTextPassword, salt);

    return hashedPassword;
  } catch (error) {
    console.error("Error hashing password:", error);
    throw error;
  }
};

export const checkPassword = async (
  enteredPassword: string,
  storedHashedPassword: string
) => {
  try {
    const passwordMatches = await bcrypt.compare(
      enteredPassword,
      storedHashedPassword
    );

    return passwordMatches;
  } catch (error) {
    console.error("Error checking password:", error);
    throw error;
  }
};

export const extractUserIdFromRequest = (req: Request) => {
  return (req.user as User)?.id;
};

export const isValidUsername = (un: string) => {
  if (un.length > 30) {
    return false;
  }
  const regex = /^[a-z0-9_]+$/;

  return regex.test(un);
};
