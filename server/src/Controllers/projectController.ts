import { NextFunction, Request, Response } from "express";
import { In, IsNull } from "typeorm";
import { AppDataSource } from "../data-source";
import { Chat } from "../entity/Chat";
import { Department } from "../entity/Department";
import { GroupChat } from "../entity/GroupChat";
import { Project } from "../entity/Project";
import { ProjectAttachment } from "../entity/ProjectAttachment";
import { ProjectParticipationPeriod } from "../entity/ProjectParticipationPeriod";
import { ProjectTeamMember } from "../entity/ProjectTeamMember";
import { User } from "../entity/User";
import { broadcastToUsers } from "../sockets/socket";
import { extractUserIdFromRequest, gBucketName, gStorage } from "../utils";

export const isHeadOfDepartment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.log("isHeadOfDepartment middleware call");
  try {
    if ((req.user as User).headOf !== null) {
      return next();
    }

    return res.status(403).json({ error: "You're not a head of department" });
  } catch (error) {
    console.error("Error in isHeadOfDepartment middleware:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

export const createProject = async (req: Request, res: Response) => {
  const user = req.user as User;
  const attachments = req.files || [];

  const {
    name,
    description,
    projectMembersIds: _pmids,
    projectManagerId: _pmid,
    createProjectGroup: _cpg,
    isDepartmentProject: _isdp,
  } = req.body;

  const isEnoughData = [name, description, _pmids, _pmid].every(
    (e) => e !== undefined
  );

  if (!isEnoughData) return res.status(400).json("Not enough data");

  let projectMembersIds,
    createProjectGroup,
    projectManagerId,
    isDepartmentProject;
  try {
    projectMembersIds = JSON.parse(_pmids);
    projectManagerId = Number(_pmid);
    createProjectGroup = JSON.parse(_cpg);
    isDepartmentProject = JSON.parse(_isdp);

    if (isNaN(projectManagerId))
      throw Error("projectMembersId must be a number");
  } catch (err) {
    console.error(
      "Error while parsing the projectMembersId, projectMembersIds or createProjectGroup values:",
      err
    );
    return res
      .status(400)
      .json(
        "Error while parsing the projectMembersId, projectMembersIds or createProjectGroup values:"
      );
  }

  const isArrayofNumbers = (value: any): value is number[] => {
    return (
      Array.isArray(value) && value.every((item) => typeof item === "number")
    );
  };

  if (!isArrayofNumbers(projectMembersIds))
    return res
      .status(400)
      .json("projectMembersIds should be an array of numbers");

  if (typeof projectManagerId !== "number")
    return res.status(400).json("projectManagerId must be a number");

  if (typeof isDepartmentProject !== "boolean")
    return res.status(400).json("isDepartmentProject must be a boolean");

  const errors: { [key: string]: string } = {};

  if (name.toString().trim().lenght === 0)
    errors["projectName"] = "Назва проєкту не може бути порожньою";
  if (description.toString().trim().lenght === 0)
    errors["projectDescription"] = "Опис проєкту не може бути порожнім";
  if (projectMembersIds.length === 0)
    errors["projectMembers"] =
      "В команді проєкту повинна бути хоча б одна людина";
  if (!projectManagerId)
    errors["projectManager"] = "В команді проєкту повинен бути керівник";

  if (Object.keys(errors).length !== 0) return res.status(400).json(errors);

  const teamMembers = await User.find({
    select: ["id", "department"],
    where: {
      id: In(projectMembersIds),
      department: { id: user.department.id },
    },
    relations: ["department"],
  });

  if (teamMembers.length < projectMembersIds.length)
    return res
      .status(400)
      .json("Not all users from projectMembersIds are from your department");

  if (!projectMembersIds.includes(projectManagerId))
    return res
      .status(400)
      .json("Projects manager should be a part of the project team");

  const newProject = new Project();
  newProject.name = name.toString().trim();
  newProject.description = description.toString().trim();
  newProject.manager = { id: projectManagerId } as User;
  newProject.teamMembers = [];
  newProject.attachments = [];
  if (isDepartmentProject)
    newProject.department = { id: user.department.id } as Department;

  const participationPeriods: ProjectParticipationPeriod[] = [];
  projectMembersIds.forEach((mid) => {
    const member = new ProjectTeamMember();
    member.user = { id: mid } as User;

    const period = new ProjectParticipationPeriod();
    member.participationPeriods = [period];
    participationPeriods.push(period);

    newProject.teamMembers.push(member);
  });

  for (let file of attachments as Express.Multer.File[]) {
    try {
      await new Promise((resolve, reject) => {
        const originalName = Buffer.from(file.originalname, "latin1").toString(
          "utf-8"
        );

        const onDiskName = `${Date.now()}-${originalName}`;
        const blob = gStorage
          .bucket(gBucketName)
          .file(`uploads/project-attachments/${onDiskName}`);

        const blobStream = blob.createWriteStream({
          resumable: false,
        });

        blobStream.on("error", (err) => {
          console.error("Error writing to GCS:", err);
          reject(err);
        });

        blobStream.on("finish", () => {
          const attachment = new ProjectAttachment();
          attachment.filenameOnDisk = onDiskName;
          attachment.filename = originalName;
          attachment.size = file.size;

          newProject.attachments.push(attachment);
          resolve(true);
        });

        blobStream.end(file.buffer);
      });
    } catch {}
  }

  let newBaseChat = null,
    newGroup = null;
  if (createProjectGroup) {
    newBaseChat = new Chat();
    newBaseChat.type = "group";

    newGroup = new GroupChat();
    newGroup.baseChat = newBaseChat;
    newGroup.name = newProject.name;
    newGroup.description =
      "Група для спілкування команди проєкту " + newProject.name;
    newGroup.isPrivate = true;
    newGroup.creator = { id: projectManagerId } as User;
    newGroup.members = projectMembersIds.map((mid) => ({
      id: mid,
    })) as User[];

    newProject.groupChat = newGroup;
  }

  try {
    let saved: Project = new Project();
    await AppDataSource.transaction(async (transactionManager) => {
      if (createProjectGroup && newBaseChat && newGroup) {
        await transactionManager.save(newBaseChat);
        await transactionManager.save(newGroup);
      }
      await transactionManager.save(newProject.attachments);
      await transactionManager.save(participationPeriods);
      await transactionManager.save(newProject.teamMembers);
      saved = await transactionManager.save(newProject);

      if (createProjectGroup && newBaseChat && newGroup) {
        broadcastToUsers(projectMembersIds, "new chat", {
          type: "g",
          data: {
            id: newGroup.id,
            name: newGroup.name,
          },
        });
      }
    });

    broadcastToUsers(projectMembersIds, "new project", {
      id: newProject.id,
      name: newProject.name,
    });

    res.status(200).json({ success: !!saved, projectId: saved?.id });
  } catch (err) {
    console.error("Error while creating a project:", err);
    res.status(500).json();
  }
};

export const getMyProjects = async (req: Request, res: Response) => {
  const userId = extractUserIdFromRequest(req);
  console.log("getMyProjects request");

  try {
    const members = await ProjectTeamMember.find({
      select: {
        id: true,
        project: {
          id: true,
          name: true,
        },
      },
      where: {
        user: {
          id: userId,
        },
        project: {
          endDate: IsNull(),
        },
      },
      relations: {
        user: true,
        project: true,
        participationPeriods: true,
      },
    });

    const projects = members
      .filter((m) => m.participationPeriods.some((p) => p.endDate === null))
      .map((m) => m.project);

    res.status(200).json({ projects: projects });
  } catch (err) {
    console.error("Error while creating a project:", err);
    res.status(500).json();
  }
};

export const getAllProjects = async (req: Request, res: Response) => {
  console.log("getDepartmentProjects request");

  try {
    const projects = await Project.find({
      select: {
        id: true,
        name: true,
      },
      where: {
        endDate: IsNull(),
      },
    });

    res.status(200).json({ projects: projects });
  } catch (err) {
    console.error("Error while creating a project:", err);
    res.status(500).json();
  }
};

export const getProjectData = async (req: Request, res: Response) => {
  const user = req.user as User;
  const { pid } = req.query;
  console.log("getProjectData request");

  const projectId = Number(pid);

  if (isNaN(projectId))
    return res.status(400).json("projectId must be an integer");

  try {
    const _project = await Project.findOne({
      select: {
        id: true,
        name: true,
        description: true,
        attachments: {
          id: true,
          filename: true,
          size: true,
        },
        teamMembers: {
          id: true,
          user: {
            id: true,
            firstName: true,
            lastName: true,
            patronymic: true,
            position: true,
          },
          participationPeriods: { id: true, endDate: true },
        },
        manager: {
          id: true,
          firstName: true,
          lastName: true,
          patronymic: true,
        },
        groupChat: {
          id: true,
          name: true,
        },
        department: {
          id: true,
        },
      },
      where: {
        id: projectId,
        endDate: IsNull(),
      },
      relations: {
        teamMembers: {
          user: true,
          participationPeriods: true,
        },
        manager: true,
        groupChat: true,
        attachments: true,
        department: true,
      },
    });

    if (!_project) return res.status(404).json();

    const { teamMembers, ...pr } = _project;
    const project = {
      ..._project,
      activeTeamMembers: teamMembers.filter((tm) =>
        tm.participationPeriods.some((pp) => pp.endDate === null)
      ),
    };

    if (
      (!project.department && user.headOf) ||
      (project.department && user.headOf === project.department) ||
      project.teamMembers.some((m) => m.user.id === user.id)
    )
      return res.status(200).json(project);

    const { attachments, groupChat, ...publicProjectData } = project;

    res.status(200).json(publicProjectData);
  } catch (err) {
    console.error("Error while getting project data:", err);
    res.status(500).json();
  }
};

export const getProjectAttachment = async (req: Request, res: Response) => {
  console.log("getProjectAttachment request");
  const { attId } = req.query;

  if (!attId || isNaN(Number(attId)))
    return res.status(400).send("Invalid attId parameter");

  try {
    const requestingUserId = extractUserIdFromRequest(req);
    // TODO: check if user has access to the file (right to download it)

    const attachment = await ProjectAttachment.findOneBy({ id: Number(attId) });

    if (!attachment) return res.status(404).json();

    const filename = `uploads/project-attachments/${attachment.filenameOnDisk}`;

    const file = gStorage.bucket(gBucketName).file(filename);

    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json("File not found");
    }

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(attachment.filename)}"`
    );
    file.createReadStream().pipe(res);
  } catch (err) {
    console.log("error while getting project attachment:", err);
    return res.status(500).json(null);
  }
};
