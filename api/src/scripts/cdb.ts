import * as service from "../service.js";

import * as io from "../io.js";
import * as fs from "../fs.js";
import { identify_compiler, Compiler } from "catter-c";

export class CDB implements service.CatterService {
  save_path: string;
  commandArray: Array<[Compiler, string]> = [];

  constructor(save_path: string) {
    this.save_path = save_path;
  }

  onStart(config: service.CatterConfig): service.CatterConfig {
    return config;
  }
  onFinish() {
    fs.createFile(this.save_path);
    io.TextFileStream.with(this.save_path, "ascii", (stream) => {
      stream.write(JSON.stringify(this.commandArray, null, 2));
    });
  }

  onCommand(
    id: number,
    data: service.CommandData | service.CatterErr,
  ): service.Action {
    if ("msg" in data) {
      io.println(`CDB received error: ${data.msg}`);
    } else {
      const compiler = identify_compiler(data.exe);
      if (compiler !== "unknown") {
        this.commandArray.push([compiler, data.argv.join(" ")]);
      }
    }
    return {
      type: "skip",
    };
  }

  onExecution(id: number, event: service.ExecutionEvent) {
    // No action needed for execution events in this service
  }
}
