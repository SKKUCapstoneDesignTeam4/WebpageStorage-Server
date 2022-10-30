import { initLogger, logger } from "./Logger.js";

import { Core } from "./Core.js";
import { APIServer } from "./APIServer.js";
import { DB } from "./DB.js"


initLogger()

const core = new Core();
const api = new APIServer({
    port: 4000,
    useHttp2: false,
    jwtSecretKey: "asdfasdf",
    keyPath: null,
    certPath: null,
    enableAuth: true
});


const run = async function(){
    try
    {
        await DB.init("db.db", true);

        // await DB.updateUserInfo(1, { name: "TestName2", tt: 123 });


        await core.initialize();
        core.run();

        await api.run(core);

        logger.info("WebpageStorage is started successfully");
    }
    catch(e)
    {
        logger.error(`main: ${e}`);
    }
}
run();