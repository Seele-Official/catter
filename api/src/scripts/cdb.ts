import * as service from '../service.js'

import * as io from '../io.js'




export class CDB implements service.CatterService {
    command: Array<string> = [];

    onStart(config: service.CatterConfig): service.CatterConfig {
        return config;
    }
    onFinish() {
        io.println("CDB finished");
        io.println(`Commands received: ${JSON.stringify(this.command, null, 2)}`);
    }

    onCommand(id: number, data: service.CommandData | service.CatterErr): service.Action {
        if ("msg" in data) {
            io.println(`CDB received error: ${data.msg}`);
        } else {
            io.println(`CDB received command ${id}: ${JSON.stringify(data.exe)}`);
            this.command.push(data.argv.join(" "));
        }
        
        return {
            type: "skip",
        }
    }

    onExecution(id: number, event: service.ExecutionEvent) {
        io.println(`CDB received execution event for command ${id}: ${JSON.stringify(event)}`);
    }
}