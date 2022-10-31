import { DB } from "./DB.js";
import { logger } from "./Logger.js";
import { WebSiteWatcher } from "./WebSiteWatcher.js";

export class Core
{
    constructor()
    {
        this.watchers = []
    }
    
    async initialize()
    {
        // load watchers from DB
        const infos = await DB.getWebSites(undefined);

        infos.forEach(function(info){
            this.watchers.push(new WebSiteWatcher({core: this, info: info}));
        });
    }

    run()
    {
        this.watchers.forEach(function(w){
            w.start();
        })

        logger.info(`Started Core. (Num of watchers : ${this.watchers.length})`);
    }

    // Register 
    async register(userInfo)
    {
        return await DB.insertUserInfo(userInfo);
    }

    async checkRegistered(userInfo)
    {
        const dbUserInfo = await DB.getUserInfo(userInfo.name);
        if(userInfo.password === dbUserInfo.password) return dbUserInfo.id;
        else return undefined;
    }

    async removeUser(name)
    {
        await DB.deleteUserInfo(await DB.getUserInfo(name).id);   
    }

    async updateUser(userInfo)
    {
        await DB.updateUserInfo(await DB.getUserInfo(userInfo).id, userInfo);   
    }

    // Website watcher interactions ==================

    async getWebSites()
    {
        return await DB.getWebSites();
    }


    async addWebSite(info)
    {
        try{
            await this.verifySite(info);

            const resId = (await DB.insertWebSite(info)).id;
            info.id = resId;

            const watcher = new WebSiteWatcher(this, info);
            watcher.start();
            this.watchers.push(watcher);

            logger.info(`Core: Inserted a web site.\n        id: ${info.id} / title: ${info.title} / url: ${info.url}`);

            watcher.checkImmediately();
        }
        catch(e){
            throw e;
        }
    }

    async removeWebSite(id, deleteAllPages)
    {
        try {
            const res = await DB.deleteWebSite(id, deleteAllPages);

            if(res != 0) {
                const index = this.watchers.findIndex(function(e){
                    return e.getSiteId() == id;
                });

                if(index == -1) {
                    throw Error(`Core: Cannot find deleted web site in the watchers.\n        Site id: ${id}`);
                }
                this.watchers[index].stop();
                this.watchers.splice(index, 1);

                logger.info(`Core: Deleted the web site.\n        id: ${id}`);
            } else {
                throw new SiteNotFoundError(id);
            }
        } catch(e) {
            throw e;
        }
    }

    async updateWebSite(id, params)
    {
        try {
            const res = await DB.updateWebSite(id, params);

            if(res != 0) {
                const index = this.watchers.findIndex(function(e){
                    return e.getSiteId() == id;
                });

                if(index == -1) {
                    throw Error(`Core: Cannot find deleted web site in the watchers.\n        Site id: ${id}`);
                }
                this.watchers[index].stop();
                this.watchers.splice(index, 1);

                const updatedInfo = await DB.getWebSite(id);
                const watcher = new WebSiteWatcher({ core:this, info: updatedInfo });
                watcher.run();
                this.watchers.push(watcher);

                logger.info(`Core: Updated the web site.\n        id: ${id} / params: ${JSON.stringify(params)}`);
            } else {
                throw new SiteNotFoundError(id);
            }
        } catch(e) {
            throw e;
        }
    }

    async getPages(params, fromArchieved)
    {
        return DB.getPages(params, fromArchieved);
    }

    async insertPage(info, urlInElement)
    {
        const dbRes = await DB.insertPage(info);
        info._id = dbRes._id;

        let newImagePath;
        try {
            newImagePath = await this.saveImage(info._id, info.imageUrl);
        } catch (e) {
            newImagePath = "";
        }

        await Promise.all([
            DB.updatePage(info._id, { imageUrl: newImagePath }),
            DB.updateWebSite(info.siteId, { lastUrl: urlInElement })
        ]);

        logger.info(`Core: Added a new page. (Site id: ${info.siteId})\n        id: ${info._id} / title: ${info.title}`);
    }
    async archievePage(id)
    {
        const info = await DB.getPage(id);
        if(info == undefined) {
            throw new PageNotFoundError(id);
        }

        info.isRead = true;

        const newInfoId = (await DB.archievePage(info))._id;

        if(info.imageUrl != "") {
            const fileName = info.imageUrl.split('/').pop();

            let newPath = `page_data/${newInfoId}/`;
            if(fs.existsSync("page_data") == false) {
                await fs.promises.mkdir("page_data");
            }
            if(fs.existsSync(newPath) == false) {
                await fs.promises.mkdir(newPath);
            }

            newPath += fileName;

            await Promise.all([
                fs.promises.copyFile(info.imageUrl, newPath),
                DB.updatePage(newInfoId, { imageUrl: newPath })
            ]);
        } else {
            await DB.updatePage(newInfoId, { imageUrl: "" });
        }

        logger.info(`Core: Archieved the page.\n        id: ${info._id} / title: ${info.title}`);
    }

    async removePage(id, withData)
    {
        if(withData) {
            try {
              await rimrafPromise(`page_data/${id}`);
            } catch(e) {
                logger.warn(`Core: Failed to delete the page data.\n        id: ${id}\n        ${e}`);
            }
        }

        const res = await DB.deletePage(id);

        if(res == 0) {
            throw new PageNotFoundError(id);
        } else {
            logger.info(`Core: Deleted the page.\n        id: ${id}`);
        }
    }

    async archieveNewPage(info)
    {
        const dbRes = await DB.archievePage(info);
        info._id = dbRes._id;

        let newImagePath;
        try {
            newImagePath = await this.saveImage(info._id, info.imageUrl);
        } catch (e) {
            console.log(e);
            newImagePath = "";
        }

        await DB.updatePage(info._id, { imageUrl: newImagePath });

        logger.info(`Core: Archieved a new page.\n        id: ${info._id} / title: ${info.title}`);
    }


    async readPage(id, setUnread)
    {
        if(setUnread == false) {
            const res = await DB.updatePage(id, { isRead: true });
            if(res == 0) {
                throw new PageNotFoundError(id);
            }
        } else {
            const res = await DB.updatePage(id, { isRead: false });
            if(res == 0) {
                throw new PageNotFoundError(id);
            }
        }
    }

    async getCategories(name, withSub)
    {
        if(withSub == false) {
            const res = await DB.getCategory(name);
            if(res == null) {
                return []
            } else {
                return [res];
            }
        } else {
            return await DB.getCategoriesWithSub(name);
        }
    }

    async addCategory(name)
    {
        await DB.insertCategory(name);
        Log.info(`Core: Inserted a category.\n        name: ${name}`);
    }

    async removeCategory(name)
    {
        await DB.deleteCategory(name);

        logger.info(`Core: Deleted a category.\n        name: ${name}`);
    }

    //==============================================

    async verifySite()
    {

    }

    async saveThumbnail()
    {

    }

}