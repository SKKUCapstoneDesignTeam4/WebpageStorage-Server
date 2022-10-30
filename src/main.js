import { initLogger, logger } from "./Logger.js";

import { Core } from "./Core.js";
import { APIServer } from "./APIServer.js";
import { DB } from "./DB.js"


initLogger()

const core = new Core();
const api = new APIServer({
    port: 3000,
    useHttp2: false,
    jwtSecretKey: 1,
    keyPath: null,
    certPath: null,
    enableAuth: true
});


try
{
    DB.init("db.db", true);

    // // await DB.insertUserInfo({ name: "TestName", password: "TestPassword" });

    // await DB.updateUserInfo(2, { name: "TestName2", tt: 123 });
    // await DB.updateUserInfo(1, { name: "TestName2", tt: 123 });


    core.initialize();
    core.run();

    api.run(core);

    logger.info("WebpageStorage is started successfully");
}
catch(e)
{
    logger.error(`main: ${e}`);
}
