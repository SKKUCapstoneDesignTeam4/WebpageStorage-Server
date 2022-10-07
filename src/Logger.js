import * as winston from 'winston'
import  'winston-daily-rotate-file'
import moment from "moment"
import fs from "fs"

let logger;
function initLogger()
{
    if(fs.existsSync("logs") == false) {
        fs.mkdirSync("logs");
    }

    const format = winston.format.printf((info) => 
        `${moment().format("YYYY-MM-DD HH:mm:ss")} [${info.level.toUpperCase()}] - ${info.message}`
    );

    const fileTransport = new winston.transports.DailyRotateFile({
        filename: "logs/%DATE%-logs.log",
        datePattern: "YYYY-MM-DD",
        maxSize: "128k",
        // maxFiles: "30d",
        format: format
    });

    const consoleTransport = new winston.transports.Console({
        format: format
    });

    logger = winston.createLogger({
        transports: [ fileTransport, consoleTransport ]
    });
}

export { logger, initLogger };
