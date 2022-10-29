import sqlite3 from 'sqlite3';
import * as sqlite from 'sqlite';
import SQL from 'sql-template-strings';

import { logger } from "./Logger.js";

class DB
{
    async init(fileName, useVerbose = false)
    {
        if(useVerbose) {
            sqlite3.verbose();
        }

        if(fileName == undefined) {
            fileName = "db.db"
        }

        this.db = await sqlite.open({ filename: fileName, driver: sqlite3.Database });

        this.initDBSchema();

        logger.info(`Successfully load DB. (${fileName})`);
    }

    async initDBSchema()
    {
        // TODO: DB schema 수정되면 수정하기

        await Promise.all([
            this.db.exec("CREATE TABLE IF NOT EXISTS user_info (_id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, password TEXT)"),
            this.db.exec("CREATE TABLE IF NOT EXISTS web_site_info (_id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, url TEXT, crawl_url TEXT, css_selector TEXT, last_url TEXT)"),
            this.db.exec("CREATE TABLE IF NOT EXISTS web_page_info (_id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, url TEXT, thumbnail_url TEXT, desc TEXT, time TEXT, is_read INTEGER, site_id INTEGER)")
        ]);
    }

    async shutdown()
    {
        await this.db.close();
    }

    async getUserInfo(name)
    {
    }

    async insertUserInfo(userInfo)
    {
    }

    async deleteUserInfo(id)
    {
    }

    async updateUserInfo(id, params)
    {
    }

    async getWebSites()
    {
    }

    async getWebSite(id)
    {
    }

    async insertWebSite(webSiteInfo)
    {
    }

    async deleteWebSite(id, deleteAllPages = false)
    {
    }

    async updateWebSite(id, params)
    {
    }

    async getPages(params)
    {
    }

    async getPage(id)
    {
    }

    async insertPage(webPageInfo)
    {
    }

    async deletePage(id)
    {
    }

    async updatePage(id, params)
    {
    }
}

const db = new DB()
export { db as DB }
