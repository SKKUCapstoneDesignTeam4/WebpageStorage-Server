import axios from "axios";
import * as cheerio from "cheerio";

import { DB } from "./DB.js";
import { logger } from "./Logger.js";
import { WebSiteWatcher } from "./WebSiteWatcher.js";
import { relToAbsUrl } from "./Utility.js";
import { InvalidRequestError } from "./Error.js";

export class Core
{
    watchers = []

    constructor()
    {
    }
    
    async initialize()
    {
        // load watchers from DB
        const infos = await DB.getWebSites(-1);

        infos.forEach((info) => {
            this.watchers.push(new WebSiteWatcher(this, info));
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

    async getWebSites(userId)
    {
        return await DB.getWebSites(userId);
    }


    async addWebSite(info)
    {
        try{
            await this.verifySite(info);

            const resId = await DB.insertWebSite(info);
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

    async removeWebSite(userId, id, deleteAllPages)
    {
        const deleteNum = await DB.deleteWebSite(userId, id, deleteAllPages);

        if(deleteNum != 0) {
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
            throw new InvalidRequestError(`Site not found (id: ${id})`, 404);
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

    //==============================================

    async verifySite(webSiteInfo)
    {
        let res = await axios.get(webSiteInfo.crawlUrl);

        const $ = cheerio.load(res.data);
        const aElement = $(webSiteInfo.cssSelector)[0];

        const pageUrl = relToAbsUrl(aElement.attribs.href, webSiteInfo.url);
    }

    async saveThumbnail()
    {

    }

}