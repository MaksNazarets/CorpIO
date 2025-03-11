import { Request, Response } from "express";
import { Department } from "../entity/Department";
import { User } from "../entity/User";

export const getAllDepartments = async (req: Request, res: Response) => {
  console.log("all departments request received");
  try {
    const departments = await Department.find();
    console.log("departments fetched");

    return res.status(200).json({ departments: departments });
  } catch (err) {
    console.error("Error fetching departments:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const createDepartment = async (req: Request, res: Response) => {
  try {
    const departmentName = req.body.name;

    if (!departmentName || departmentName.trim().length === 0)
      return res.status(400).json({
        errorTypes: ["name"],
        errorMessages: ["Відділ повинен мати назву"],
      });

    const isUnique =
      (await Department.findOneBy({ name: departmentName })) === null;

    if (!isUnique)
      return res.status(400).json({
        errorTypes: ["name"],
        errorMessages: ["Відділ з такою назвою вже існує"],
      });

    const department = new Department();
    department.name = departmentName.trim();

    await department.save();

    console.log("department successfully created");

    return res.status(201).json({ success: true });
  } catch (err) {
    console.error("Error during department creation:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const updateDepartment = async (req: Request, res: Response) => {
  console.log("updateDepartment request");

  const departmentName = req.body.name?.trim();
  // TODO: check if depId param is number

  try {
    if (!departmentName || departmentName.length === 0) {
      console.log("404");

      return res.status(400).json({
        errorTypes: ["name"],
        errorMessages: ["Відділ повинен мати назву"],
      });
    }

    const withSameName = await Department.findOneBy({ name: departmentName });
    console.log(req.body.id, withSameName?.id);

    if (withSameName && withSameName.id !== Number(req.params.depId)) {
      console.log("new name not unique");

      return res.status(400).json({
        errorTypes: ["name"],
        errorMessages: ["Відділ з такою назвою вже існує"],
      });
    }

    const department = await Department.findOneBy({
      id: Number(req.params.depId),
    });

    if (!department) return res.status(404).json(null);

    department.name = departmentName;
    department.head = await User.findOneBy({ id: req.body.headId });

    await department.save();

    console.log("department successfully updated");

    return res.status(200).json(null);
  } catch (err) {
    console.error("Error during department updating:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteDepartment = async (req: Request, res: Response) => {
  console.log("deleteDepartment request");

  try {
    const department = await Department.findOne({
      select: {
        id: true,
        employees: {
          id: true,
        },
      },
      where: { id: Number(req.params.depId) },
      relations: {
        employees: true,
      },
    });

    if (!department) return res.status(404).json(null);

    if (department.employees.length !== 0)
      return res.status(409).json({
        errorMessages: [
          "Відділ має працівників. Спочатку переведіть всіх працівників в інший відділ",
        ],
      });

    const success = await department.remove();

    if (success) {
      console.log("department successfully removed");
      return res.status(204).json(null);
    } else {
      console.log("error while removing department");
    }
    return res.status(500).json(null);
  } catch (err) {
    console.error("Error during department updating:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getDepartmentList = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    console.log("getDepartmentList request");

    const departments = await Department.find({
      relations: ["head"],
      order: {
        id: "ASC",
      },
    });

    const result = departments.map((department) => ({
      id: department.id,
      name: department.name,
      head: department.head
        ? {
            id: department.head.id,
            name: `${department.head.lastName} ${department.head.firstName} ${
              department.head.patronymic || ""
            }`,
          }
        : null,
    }));

    console.log("departments fetched");

    return res.status(200).json({ departments: result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getDepartment = async (req: Request, res: Response) => {
  console.log("getDepartment request");

  const depId = Number(req.query.depId);
  if (!depId) {
    return res.status(400).json(null);
  }

  const withHead = req.query.withHead === "true" || false;

  try {
    let department: Department | null;
    if (withHead) {
      department = await Department.findOne({
        where: { id: depId },
        relations: ["head"],
      });
    } else {
      department = await Department.findOneBy({ id: depId });
    }

    if (!department) {
      return res
        .status(404)
        .json({ error: "Department with such id not found" });
    }
    const result = {
      id: department.id,
      name: department.name,
      head:
        withHead && department.head
          ? {
              id: department.head.id,
              firstName: department.head.firstName,
              lastName: department.head.lastName,
              patronymic: department.head.patronymic,
            }
          : null,
    };

    console.log("department fetched");

    return res.status(200).json({ department: result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
