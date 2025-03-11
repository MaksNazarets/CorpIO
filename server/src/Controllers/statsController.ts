import { Request, Response } from "express";
import { AppDataSource } from "../data-source";
import writeXlsxFile from "write-excel-file/node";

export const getMessageLoadStatistics = async (req: Request, res: Response) => {
  try {
    const stats = await AppDataSource.query(
      "SELECT * FROM get_load_statistics()"
    );

    if (!stats) res.status(400).json();

    const data = [
      [
        {
          value: "Година",
          fontWeight: "bold",
        },
        {
          value: "% навантаження",
          fontWeight: "bold",
        },
      ],

      ...stats.map((s: any) => [
        { type: String, value: s.hour, width: 20 },
        { type: Number, value: Number(s.percentage.toFixed(2)), width: 20 },
      ]),
    ];

    writeXlsxFile(data, { buffer: true, sheet: "Messaging load by hour" })
      .then((buffer) => {
        res.setHeader(
          "Content-Type",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=msg-load-stats.xlsx"
        );

        res.send(buffer);
      })
      .catch((err) => {
        console.error(err);
        res.status(500).send("Error generating Excel file");
      });
  } catch (err) {
    console.error("Error while getting the stats:", err);
    res.status(500).json();
  }
};
