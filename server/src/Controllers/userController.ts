import { NextFunction, Request, Response } from "express";
import { JsonWebTokenError, sign } from "jsonwebtoken";
import passport from "passport";
import { transliterate } from "transliteration";
import { FindOptionsWhere, ILike, Not } from "typeorm";
import { Department } from "../entity/Department";
import { User } from "../entity/User";
import { broadcastToUsers } from "../sockets/socket";
import {
  checkPassword,
  extractUserIdFromRequest,
  gBucketName,
  gStorage,
  hashPassword,
  isValidUsername,
} from "../utils";
import path from "path";

export const isAuthenticated = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  passport.authenticate(
    "jwt",
    { session: false },
    (err: JsonWebTokenError, user: User | null, info: any) => {
      if (err) {
        return res.status(500).json({ message: "JWT server error" });
      }

      if (!user) {
        console.log("! unauthorized request (401):", info);
        return res
          .status(401)
          .json({ message: "Unauthorized (unauthenticated)", error: info });
      }

      req.user = user;
      next();
    }
  )(req, res, next);
};

export const isAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.log("isAdmin middleware call");
  try {
    if ((req.user as User).department.id === 1) {
      return next();
    }

    return res.status(401).json({ error: "Unauthorized" });
  } catch (error) {
    console.error("Error in isAdmin middleware:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const loginUser = async (req: Request, res: Response) => {
  console.log("login request");

  try {
    const { username, password: pass } = req.body;

    const _username = username?.toString().trim();
    const user = await User.findOne({
      where: { username: _username },
      relations: {
        department: true,
        headOf: true,
      },
    });

    console.log(username, user?.username);
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    console.log(username, pass);
    const passwordMatches = await checkPassword(pass, user.password);

    if (!passwordMatches) {
      console.log("Unsuccessful login. Password is incorrect");
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = sign({ sub: user.id }, process.env.JWT_SECRET as string, {
      expiresIn: "1y",
    });

    console.log("Password is correct");
    const {
      password,
      registrationDate,
      isOnline,
      lastTimeOnline,
      headOf,
      ...userToSend
    } = user;

    res.cookie("jwtToken", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });
    return res.status(200).json({
      message: "Authentication successful",
      user: { ...userToSend, isHeadOfDepartment: headOf !== null },
    });
  } catch (err) {
    console.log("error while login process:", err);
    res.status(500).json(null);
  }
};

export const logoutUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    res.clearCookie("jwtToken");
    console.log("User logged out");

    res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    console.error("Error during logout:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getMe = async (req: Request, res: Response) => {
  try {
    console.log("getMe request");

    const user = req.user as User;

    if (user) {
      const {
        password,
        registrationDate,
        lastTimeOnline,
        isActive,
        headOf,
        ...userToReturn
      } = user;

      console.log("user found");
      return res.status(200).json({
        user: { ...userToReturn, isHeadOfDepartment: headOf !== null },
      });
    } else {
      return res.status(404).json({ error: "User not found" });
    }
  } catch (error) {
    console.error("Error fetching user:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const validateUserData = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.log("validation of the received user data");

  const userData = req.body;

  let errors: string[] = [];
  const errorMsgs: string[] = [];

  try {
    const isValidStr = 
      (str: string | null) => str && str.trim().length > 0;

    if (userData.firstName !== undefined 
      && !isValidStr(userData.firstName))
      errors.push("firstName");
    if (userData.lastName !== undefined 
      && !isValidStr(userData.lastName))
      errors.push("lastName");
    if (userData.patronymic !== undefined 
      && !isValidStr(userData.patronymic))
      req.body.patronymic = null;
    if (userData.email !== undefined 
      && !isValidStr(userData.email))
      errors.push("email");
    if (userData.phoneNumber !== undefined 
      && !isValidStr(userData.phoneNumber))
      errors.push("phoneNumber");
    if (userData.position !== undefined 
      && !isValidStr(userData.position)) {
      errors.push("position");
    }

    if (errors.length > 0) errorMsgs.push("Поля не можуть бути порожніми");
    if (userData.currentPassword && !userData.newPassword) {
      errors.push("newPassword");
      errorMsgs.push("Новий пароль не може бути порожнім");
    }
    if (userData.newPassword && !userData.currentPassword) {
      errors.push("newPassword");
      errorMsgs.push("Введіть актуальний пароль");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (
      userData.email !== undefined &&
      !emailRegex.test(userData.email.trim())
    ) {
      errors.push("email");
      errorMsgs.push("Адреса ел. пошти має неправильний формат");
    }
  } catch (err) {
    console.error("Error while validating updated user data:", err);
    return res.status(400).json("Error while validating updated user data");
  }

  if (userData.phoneNumber !== undefined && userData.phoneNumber.length < 13) {
    errors.push("phoneNumber");
    errorMsgs.push("Номер телефону закороткий");
  }

  if (userData.phoneNumber !== undefined && userData.phoneNumber.length > 13) {
    errors.push("phoneNumber");
    errorMsgs.push("Номер телефону задовгий");
  }
  try {
    if (
      userData.phoneNumber &&
      (await User.findOneBy({
        phoneNumber: userData.phoneNumber.trim(),
      }))
    ) {
      errors.push("phoneNumber");
      errorMsgs.push("Користувач з таким номером телефону вже існує");
    }
  } catch (err) {
    console.error("Error while validating new user phone number: ", err);
    errorMsgs.push("Сталась помилка при перевірці email");
  }

  try {
    if (
      userData.email &&
      (await User.findOneBy({ email: userData.email.trim() })) != null
    ) {
      errors.push("email");
      errorMsgs.push("Користувач з такою ел. поштою вже існує");
    }
  } catch (err) {
    console.error("Error while validating new user email: ", err);
    errorMsgs.push("Сталась помилка при перевірці email");
  }

  if (errors.length > 0) {
    console.log("user data is invalid:", errorMsgs);

    return res.status(400).json({
      errorTypes: errors,
      errorMessages: errorMsgs,
    });
  }

  console.log("user data is valid");
  next();
};

export const registerUser = async (req: Request, res: Response) => {
  try {
    const department = await Department.findOneBy({
      id: req.body.isAdmin ? 1 : req.body.departmentId,
    });

    if (!department) return res.status(400).json({ errors: ["department"] });

    const userData = req.body;

    const user = new User();

    user.firstName = userData.firstName.trim();
    user.lastName = userData.lastName.trim();
    user.patronymic = userData.patronymic?.trim();
    user.email = userData.email.trim();
    user.phoneNumber = userData.phoneNumber.trim();
    user.position = userData.position.trim();
    user.isSuperAdmin = (req.user as User).isSuperAdmin
      ? userData.isSuperAdmin
      : false;
    user.department = department;

    let username = transliterate(`${user.firstName}_${user.lastName}`)
      .toLowerCase()
      .substring(0, 30);

    let i = 1;
    while (await User.findOneBy({ username: username })) {
      username = username.substring(0, 30 - i.toString().length) + i.toString();
      i++;
    }
    user.username = username;
    user.password = await hashPassword(user.email);

    await user.save();
    console.log("user successfully registered");

    return res.status(201).json({ success: true });
  } catch (err) {
    console.error("Error during user registration:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const updateUserPersonalData = async (req: Request, res: Response) => {
  const userData = req.body;
  console.log("updateUserPersonalData request");

  if (
    !userData.email &&
    !userData.username &&
    !userData.phoneNumber &&
    !(
      userData.currentPassword !== undefined &&
      userData.newPassword !== undefined
    )
  )
    return res.status(400).json();

  const requestingUser = req.user as User;

  if (userData.email) requestingUser.email = userData.email.trim();
  if (userData.phoneNumber)
    requestingUser.phoneNumber = userData.phoneNumber.trim();
  if (userData.position) requestingUser.position = userData.position.trim();

  if (userData.username !== undefined && !isValidUsername(userData.username)) {
    return res.status(400).json({
      errorTypes: ["username"],
      errorMessages: [
        // 'Псевдонім може складатись лише з літер a-z, цифер та знаків "_" та бути довжиною до 30 символів',
        "Псевдонім має неправильний формат",
      ],
    });
  }

  try {
    if (
      userData.currentPassword !== undefined &&
      userData.newPassword !== undefined
    ) {
      console.log(requestingUser.password);
      const passwordMatches = await checkPassword(
        userData.currentPassword,
        requestingUser.password
      );

      if (!passwordMatches)
        return res.status(400).json({
          errorTypes: ["currentPassword"],
          errorMessages: ["Неправильний актуальний пароль"],
        });

      requestingUser.password = await hashPassword(userData.newPassword);
    }

    if (userData.username) {
      if (
        await User.findOneBy({
          username: userData.username,
          id: Not(requestingUser.id),
        })
      ) {
        return res.status(400).json({
          errorTypes: ["username"],
          errorMessages: ["Цей псевдонім вже зайнятий"],
        });
      }

      requestingUser.username = userData.username;
    }

    await requestingUser.save();
    broadcastToUsers([requestingUser.id], "personal-data-changed", {
      username: requestingUser.username,
      phoneNumber: requestingUser.phoneNumber,
      email: requestingUser.email,
    });
    console.log("user data successfully changed");

    return res.status(201).json({ success: true });
  } catch (err) {
    console.error("Error during user data change:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getUsers = async (req: Request, res: Response) => {
  const depId = Number(req.query.depId) || null;
  const fullInfo = Boolean(req.query.fullInfo) || false;
  const likeString = req.query.likeStr;

  try {
    console.log("getUsers request");

    let users: User[] | null;

    const searchParams = likeString
      ? ([
          {
            department: { id: depId },
            firstName: ILike(likeString.toString().trim() + "%"),
          },
          {
            department: { id: depId },
            lastName: ILike(likeString.toString().trim() + "%"),
          },
          {
            department: { id: depId },
            patronymic: ILike(likeString.toString().trim() + "%"),
          },
          {
            department: { id: depId },
            username: ILike(likeString.toString().trim() + "%"),
          },
        ] as FindOptionsWhere<User>)
      : ({ department: { id: depId } } as FindOptionsWhere<User>);

    if (!fullInfo) {
      users = await User.find({
        where: searchParams,
        select: ["id", "firstName", "lastName", "patronymic", "position"],
      });
    } else {
      users = await User.find({
        select: {
          id: true,
          firstName: true,
          lastName: true,
          patronymic: true,
          username: true,
          position: true,
          department: {
            name: true,
          },
        },
        relations: {
          department: true,
        },
        where: searchParams,
      });
    }

    if (users) {
      console.log("users found");
      return res.status(200).json({ users });
    } else {
      return res.status(404).json({ error: "Users not found" });
    }
  } catch (error) {
    console.error("Error fetching user:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const getUserData = async (req: Request, res: Response) => {
  const userId = Number(req.query.userId) || null;

  if (userId === null) return res.status(400).json("Wrong userId parameter");

  const requestingUserId = extractUserIdFromRequest(req);

  try {
    console.log("getUserData request");

    const user = await User.findOne({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        patronymic: true,
        username: true,
        phoneNumber: true,
        email: true,
        position: true,
        department: {
          name: true,
        },
        isOnline: true,
        lastTimeOnline: true,
        user1Chats: {
          id: true,
          user2: { id: true },
        },
        user2Chats: {
          id: true,
          user1: { id: true },
        },
      },
      relations: {
        department: true,
        user1Chats: {
          user2: true,
        },
        user2Chats: {
          user1: true,
        },
      },
      where: { id: userId },
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    const { user1Chats, user2Chats, ...userToReturn } = user;

    console.log("user found");

    return res.status(200).json({
      ...userToReturn,
      chatId: user
        .getPrivateChats()
        .find(
          (chat) =>
            chat.user1?.id === requestingUserId ||
            chat.user2?.id === requestingUserId
        )?.id,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const findCurrentAvatarByUserId = async (userId: number) => {
  const [files] = await gStorage
    .bucket(gBucketName)
    .getFiles({ prefix: `uploads/user_data/u_${userId}/` });

  return files.find((file) =>
    file.name.substring(file.name.lastIndexOf("/") + 1).startsWith("avatar.")
  );
};

export const getUserAvatar = async (req: Request, res: Response) => {
  const { userId } = req.params;

  if (!userId || isNaN(Number(userId)))
    return res.status(400).send("Invalid userId parameter");

  try {
    const file = await findCurrentAvatarByUserId(Number(userId));

    if (!file) {
      const defaultFilename = `uploads/user_data/defaults/default_avatar.svg`;
      const defaultFile = gStorage.bucket(gBucketName).file(defaultFilename);

      const [metadata] = await defaultFile.getMetadata();
      const contentType = metadata.contentType || "application/octet-stream";

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `inline; filename="avatar.svg"`);

      return defaultFile.createReadStream().pipe(res);
    }

    const [fileMetadata] = await file.getMetadata();
    const contentType = fileMetadata.contentType || "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `inline`);

    file.createReadStream().pipe(res);
  } catch (err) {
    console.error("Error searching for user avatar:", err);
    return res.status(500).send("Internal Server Error");
  }
};

export const updateUserAvatar = async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) return res.status(400).json();

  const userId = extractUserIdFromRequest(req);

  try {
    const currentAvatar = await findCurrentAvatarByUserId(userId);

    await currentAvatar?.delete();

    const fileExt = path.extname(file.originalname);

    const blob = gStorage
      .bucket(gBucketName)
      .file(`uploads/user_data/u_${userId}/avatar${fileExt}`);

    const blobStream = blob.createWriteStream({
      resumable: false,
    });

    blobStream.on("error", (err) => {
      console.error("Error while updating user avatar:", err);
      res.status(500).json();
    });

    blobStream.on("finish", () => {
      res.status(200).json({
        message: "File uploaded successfully",
        file: req.file,
      });
    });

    blobStream.end(file.buffer);
  } catch (err) {
    console.error("Error while updating user avatar:", err);
    res.status(500).json();
  }
};
