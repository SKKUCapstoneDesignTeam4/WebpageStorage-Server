import { initLogger, logger } from "./Logger.js";

import { Core } from "./Core.js";
import { APIServer } from "./APIServer.js";


initLogger()

logger.info("Test logging")


const core = new Core();
const api = new APIServer({
    port: 3000,
    iuseHttp2: false,
    password: 1,
    jwtSecretKey: 1,
    keyPath: null,
    certPath: null,
    enableAuth: false
});


try
{
    //db init
    
    core.initialize();
    core.run();

    api.run(core);

    logger.info("WebpageStorage is started successfully");
}
catch(e)
{
    logger.error(`main: ${e}`);
}