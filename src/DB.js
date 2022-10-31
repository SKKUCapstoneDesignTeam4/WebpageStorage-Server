import sqlite3 from 'sqlite3';
import * as sqlite from 'sqlite';
import SQL from 'sql-template-strings';

import { logger } from "./Logger.js";

function toCamelCase(dbRes)
{
    if(!dbRes) return dbRes;

    let res = {};
    for(let [k, v] of Object.entries(dbRes)) {
        k = k.replace(/(_[A-Za-z])/g, function(word, index) {
            return word[1].toUpperCase();
        });
        res[k] = v;
    }
    return res;
}

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
            this.db.exec("CREATE TABLE IF NOT EXISTS user_info (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, password TEXT)"),
            this.db.exec("CREATE TABLE IF NOT EXISTS web_site_info (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, url TEXT, crawl_url TEXT, css_selector TEXT, last_url TEXT, owner_user_id INTEGER)"),
            this.db.exec("CREATE TABLE IF NOT EXISTS web_page_info (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, url TEXT, thumbnail_url TEXT, desc TEXT, time TEXT, is_read INTEGER, site_id INTEGER, owner_user_id INTEGER)")
        ]);
    }

    async shutdown()
    {
        await this.db.close();
    }

    async getUserInfo(name)
    {
        const res = await this.db.get(SQL`SELECT * FROM user_info WHERE name=${name}`);
        return toCamelCase(res);
    }

    async insertUserInfo(userInfo)
    {
        // TODO: name 중복 안 되게
        const res = await this.db.run(SQL`INSERT INTO user_info (name, password) VALUES (${userInfo.name}, ${userInfo.password})`);
        return res.lastID;
    }

    async deleteUserInfo(id)
    {
        const res = await this.db.run(SQL`DELETE FROM user_info WHERE id=${id}`);
        return res.changes;
    }

    async updateUserInfo(id, params)
    {
        if(!id) return;

        let paramString = []
        if(params.name) paramString.push(`name='${params.name}'`);
        if(params.password) paramString.push(`password='${params.password}'`);

        if(paramString.length > 0) {
            await this.db.run(
                SQL`UPDATE user_info SET `
                .append(paramString.join(","))
                .append(SQL` WHERE id=${id}`));
        }
    }

    async getWebSites(userId)
    {
        const query = SQL`SELECT * FROM web_site_info`;
        if(userId != -1) query.append(SQL` WHERE owner_user_id=${userId}`);

        const res = await this.db.all(query);

        return res.map(function(e){ return toCamelCase(e) });
    }

    async getWebSite(userId, id)
    {
        const query = SQL`SELECT * from web_site_info WHERE id=${id}`;
        if(userId != -1) query.append(SQL` AND owner_user_id=${userId}`);
        const res = await this.db.get(query);

        return toCamelCase(res);
    }

    async insertWebSite(webSiteInfo)
    {
        const query = SQL`INSERT INTO web_site_info (title, url, crawl_url, css_selector, last_url, owner_user_id) `;
        query.append(SQL`VALUES (${webSiteInfo.title}, ${webSiteInfo.url}, ${webSiteInfo.crawlUrl}, ${webSiteInfo.cssSelector},
                                 ${webSiteInfo.lastUrl}, ${webSiteInfo.ownerUserId})`);

        const res = await this.db.run(query);
        return res.lastID;
    }

    async deleteWebSite(userId, id, deleteAllPages = false)
    {
        const query = SQL`DELETE FROM web_site_info WHERE id=${id}`;
        if(userId != -1) query.append(SQL` AND owner_user_id=${userId}`);
        const res = await this.db.run(query);

        if(deleteAllPages) {
            const query2 = SQL`DELETE FROM web_page_info WHERE site_id=${id}`;
            if(userId != -1) query2.append(SQL` AND owner_user_id=${userId}`);
            await this.db.run(query2);
        }

        return res.changes;
    }

    async updateWebSite(userId, id, params)
    {
        if(!id) return;

        let paramString = [];
        if(params.title) paramString.push(`title="${params.title}"`);
        if(params.url) paramString.push(`url="${params.url}"`);
        if(params.crawlUrl) paramString.push(`crawl_url="${params.crawlUrl}"`);
        if(params.cssSelector) paramString.push(`css_selector="${params.cssSelector}"`);
        if(params.lastUrl) paramString.push(`last_url="${params.lastUrl}"`);
        if(params.ownerUserId) paramString.push(`owner_user_id=${params.ownerUserId}`);

        if(paramString.length > 0) {
            const query = SQL`UPDATE web_site_info SET `
                             .append(paramString.join(","))
                             .append(SQL` WHERE id=${id}`);
            if(userId != -1) query.append(SQL` AND owner_user_id=${userId}`);

            const res = await this.db.run(query);
            return res.changes;
        } else {
            return -1;
        }
    }

    // Pages만의 특별한 parmas
    //   * afterId
    //   * count
    async getPages(userId, params)
    {
        const query = SQL`SELECT * FROM web_page_info WHERE owner_user_id=${userId}`;
        if(params.afterId) {
            query.append(SQL` AND id < ${afterId}`);
        }
        if(params.count) {
            query.append(SQL` LIMIT ${params.count}`);
        }

        const res = await this.db.all(query);
        return res.map(function(e){ return toCamelCase(e) });
    }

    async getPage(userId, id)
    {
        const query = SQL`SELECT * from web_page_info WHERE id=${id}`;
        if(userId != -1) query.append(SQL` AND owner_user_id=${userId}`);
        const res = await this.db.get(query);

        // time만 Date타입으로 바꿔줌
        res.time = Date.parse(res.time);

        return toCamelCase(res);
    }

    async insertPage(webPageInfo)
    {
        const query = SQL`INSERT INTO web_page_info (title, url, thumbnail_url, desc, time, is_read, site_id, owner_user_id) `;
        query.append(SQL`VALUES (${webPageInfo.title}, ${webPageInfo.url}, ${webPageInfo.thumbnailUrl}, ${webPageInfo.desc},
                                 ${webPageInfo.time.toISOString()}, ${webPageInfo.isResd}, ${webPageInfo.site_id}, ${webPageInfo.owner_user_id})`);

        const res = await this.db.run(query);
        return res.lastID;
    }

    async deletePage(userId, id)
    {
        const query = SQL`DELETE FROM web_page_info WHERE id=${id}`;
        if(userId != -1) query.append(SQL` AND owner_user_id=${userId}`);

        const res = await this.db.run(query);
        return res.changes;
    }

    async updatePage(userId, id, params)
    {
        if(!id) return;

        let paramString = [];
        if(params.title) paramString.push(`title="${params.title}"`);
        if(params.url) paramString.push(`url="${params.url}"`);
        if(params.thumbnailUrl) paramString.push(`thumbnail_url="${params.thumbnailUrl}"`);
        if(params.desc) paramString.push(`desc="${params.desc}"`);
        if(params.time) paramString.push(`time="${params.time.toISOString()}"`);
        if(params.isRead) paramString.push(`is_read=${params.isRead}`);
        if(params.siteId) paramString.push(`site_id=${params.siteId}`);
        if(params.ownerUserId) paramString.push(`owner_user_id=${params.ownerUserId}`);

        if(paramString.length > 0) {
            const query = SQL`UPDATE web_page_info SET `
                          .append(paramString.join(","))
                          .append(SQL` WHERE id=${id}`);
            if(userId != -1) query.append(SQL` AND owner_user_id=${userId}`);

            const res = await this.db.run(query);
            return res.changes;
        } else {
            return -1;
        }
    }
}

const db = new DB()
export { db as DB }
