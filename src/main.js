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
    certPath: null
});


const run = async function(){
    try
    {
        await DB.init("db.db", true);

        // await DB.insertUserInfo({ name:"T3", password:"P3" });
        // await DB.deleteUserInfo(2);

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