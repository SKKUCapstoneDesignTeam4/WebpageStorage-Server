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
        const res = await this.db.get(SQL`SELECT * FROM user_info WHERE name=${name}`);

        return res;
    }

    async insertUserInfo(userInfo)
    {
        // TODO: name 중복 안 되게
        await this.db.run(SQL`INSERT INTO user_info (name, password) VALUES (${userInfo.name}, ${userInfo.password})`);
    }

    async deleteUserInfo(id)
    {
        const res = await this.db.run(SQL`DELETE FROM user_info WHERE _id=${id}`);
    }

    async updateUserInfo(id, params)
    {
        let paramString = []
        if(params.name) paramString.push(`name='${params.name}'`);
        if(params.password) paramString.push(`password='${params.password}'`);

        if(id && paramString.length > 0) {
            await this.db.run(
                SQL`UPDATE user_info SET `
                .append(paramString.join(","))
                .append(SQL` WHERE _id=${id}`));
        }
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
