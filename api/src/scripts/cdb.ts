import * as service from "../service.js";

import * as io from "../io.js";
import * as fs from "../fs.js";
import * as option from "../option/index.js";
import { identify_compiler, Compiler } from "catter-c";

type CDBItem = {
  directory: string;
  file: string;
  command: string;
  arguments?: string[];
  output?: string;
};

export class CDB implements service.CatterService {
  save_path: string;
  commandArray: Array<[Compiler, service.CommandData]> = [];

  constructor(save_path?: string) {
    this.save_path = save_path ?? "compile_commands.json";
  }

  parse(table: option.OptionTable, args: string[]): option.OptionItem[] {
    const parsed: option.OptionItem[] = [];
    option.parse(table, args, (parseRes) => {
      if (typeof parseRes === "string") {
        throw new Error(`Parsing error: ${parseRes}`);
      }
      parsed.push(parseRes);
      return true;
    });
    return parsed;
  }

  onStart(config: service.CatterConfig): service.CatterConfig {
    if (config.scriptArgs.length > 0) {
      this.save_path = config.scriptArgs[0];
    }
    return config;
  }

  onFinish() {
    fs.removeAll(this.save_path);
    fs.createFile(this.save_path);
    const cdb: CDBItem[] = [];

    for (const [compiler, command] of this.commandArray) {
      switch (compiler) {
        case "clang":
          const parsed = this.parse(compiler, command.argv.slice(1));
          for (const item of parsed) {
            if (item.id === option.ClangID.ID_INPUT) {
              cdb.push({
                directory: command.cwd,
                file: item.key,
                command: command.argv.join(" "),
              });
            }
          }
          break;
        default:
          throw new Error(`Unsupported compiler: ${compiler}`);
      }
    }

    io.TextFileStream.with(this.save_path, "ascii", (stream) => {
      stream.write(JSON.stringify(cdb, null, 2));
      io.println(
        `CDB saved to ${fs.path.absolute(this.save_path)} with ${cdb.length} entries.`,
      );
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
        this.commandArray.push([compiler, data]);
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
