import koa from "koa";
import koaCors from "@koa/cors";
import koaRouter from "koa-router";
import koaHelmet from "koa-helmet";
import koaBodyParser from "koa-bodyparser";
import koaStatic from "koa-static";
import koaMount from "koa-mount";

import http from "http";
import http2 from "http2";
import jwt from "jsonwebtoken";

import fs from "fs";


import { logger } from "./Logger.js";
import { Core } from "./Core.js";

export class APIServer
{
    // port, useHttp2, keyPath, certPath, password, jwtSecretKey
    constructor(init)
    {
        this.port = 80;

        this.koaApp = new koa();

        this.jwtSecretKey = init.jwtSecretKey;

        this.httpServer = null;
        this.http2Server = null;

        if(init.port)
            this.port = init.port;
        else if(init.useHttp2)
            this.port = 443;

        if(init.useHttp2)
        {
            const options = {
                key: fs.readFileSync(init.keyPath),
                cert: fs.readFileSync(init.certPath),
                allowHTTP1: true
            };
    
            this.http2Server = http2.createSecureServer(options, this.koaApp.callback());
        } 
        else 
        {
            this.httpServer = http.createServer(this.koaApp.callback());
        }
            
        
        this.initKoa();
    }

    async run(core)
    {
        return new Promise((resolve, reject) => {
            this.core = core;
            if(this.http2Server != null)
            {
                this.http2Server.listen(this.port, () => {
                    logger.info(`Started APIServer. (Protocol: http/2, Port: ${this.port})`);

                    resolve();
                });
            }
            else 
            {
                this.httpServer.listen(this.port, () => {
                    logger.info(`Started APIServer. (Protocol: http, Port: ${this.port})`);

                    resolve();
                });
            }
        });
    }

    
    stop()
    {
        if(this.http2Server != null) 
        {
            this.http2Server.close();
        }
        if(this.httpServer != null) 
        {
            this.httpServer.close();
        }
    }
    
    initKoa()
    {
        this.koaApp.use(async function (ctx, next) {
            try 
            {
                await next();
            } 
            catch (err) 
            {
                ctx.status = 500;
                ctx.app.emit("error", err, ctx);
            }
        });

        this.koaApp.on("error", (err, ctx) => {
            logger.error(`APIServer: Error in ${ctx.request.method}:${ctx.request.url}\n        ${err.stack}`);
        });

        this.koaApp.use(koaHelmet());
        this.koaApp.use(koaHelmet.contentSecurityPolicy({
            directives: {
                defaultSrc: ["'self'"]
            }
        }));

        this.koaApp.use(koaCors());

        this.koaApp.use(koaBodyParser());

        const authRouter = new koaRouter();
        authRouter.post("/api/auth", this.auth.bind(this));
        authRouter.post("/api/register", this.register.bind(this));

        this.koaApp.use(authRouter.routes());
        this.koaApp.use(authRouter.allowedMethods())

        this.koaApp.use(koaMount("/page_data", koaStatic("page_data", { maxage: 2592000000 /* 30 days */ })));

        this.koaApp.use(this.authMiddleware.bind(this));

        const router = new koaRouter();

        router.get("/api/auth/check", this.checkAuth.bind(this));
        router.post("/api/auth/refresh", this.refreshAuth.bind(this));
        
        router.get("/api/pages", this.getPages.bind(this));
        router.get("/api/pages/archieved", this.getArchievedPages.bind(this));
        router.delete("/api/page/:id", this.removePage.bind(this));
        router.put("/api/page/read/:id", this.markPageAsRead.bind(this));
        router.post("/api/page/archieved", this.archieveNewPage.bind(this));
        router.post("/api/page/archieved/:id", this.archievePage.bind(this));

        router.get("/api/sites", this.getSites.bind(this));
        router.post("/api/site", this.addSite.bind(this));
        router.put("/api/site/:id", this.updateSite.bind(this));
        router.delete("/api/site/:id", this.removeSite.bind(this));

        router.get("/api/category", this.getCategories.bind(this));
        router.post("/api/category", this.addCategory.bind(this));
        router.delete("/api/category", this.removeCategory.bind(this));

        this.koaApp.use(router.routes());
        this.koaApp.use(router.allowedMethods());
    }

    async authMiddleware(ctx, next)
    {
        const token = ctx.headers["x-access-token"];

        if(!token) 
        {
            ctx.response.status = 401;
            return;
        }

        try 
        {
            const payload = jwt.verify(token, this.jwtSecretKey);
            // Save user id in context.state
            ctx.state.userId = payload.userId;
        } 
        catch(e) 
        {
            if(e instanceof jwt.TokenExpiredError) {
                ctx.response.status = 401;
                ctx.body = "Token expired";
                return;
            } 
            else if(e instanceof jwt.JsonWebTokenError)
            {
                ctx.response.status = 401;
                ctx.body = "Token error";
                return;
            }
            else 
            {
                throw e;
            }
        }
        
        await next();
    }
    
    async register(ctx, next)
    {
        const params = ctx.request.body;

        const newUserId = await this.core.register({name: params.id, password: params.password});
        if(!newUserId)
        {
            ctx.response.status = 400;
            return;
        }
        const token = jwt.sign({ userId: newUserId }, this.jwtSecretKey,
            {
                expiresIn: "10d",
                issuer: "WebPageStorage",
            });

        ctx.response.status = 200;
        ctx.body =  { token: token };
    }

    // Routing functions
    async auth(ctx, next)
    {
        const params = ctx.request.body;

        const userId = await this.core.checkRegistered({name: params.id, password: params.password});
        if(!userId)
        {
            ctx.response.status = 400;
            return;
        }

        const token = jwt.sign({ userId: userId }, this.jwtSecretKey,
            {
                expiresIn: "10d",
                issuer: "WebPageStorage",
            });

        ctx.response.status = 200;
        ctx.body =  { token: token };
    }

    async checkAuth(ctx, next)
    {
        ctx.response.status = 200;
    }

    async refreshAuth(ctx, next)
    {
        const token = jwt.sign({ userId: ctx.state.userId }, this.jwtSecretKey,
            {
                expiresIn: "10d",
                issuer: "WebPageStorage",
            });

        ctx.response.status = 200;
        ctx.body = token;
    }

    async getPages(ctx, next)
    {
        const params = ctx.query;
        const startIndex = parseInt(params.startIndex);

        if(startIndex < 0) {
            ctx.response.status = 400;
            return;
        }

        try 
        {
            ctx.response.status = 200;
            ctx.body = 'getPages';
        } catch(e) {
            e.message += `\n        Request parameters: ${JSON.stringify(params)}`;
            throw e;
        }
    }

    // TODO: 위에 것이랑 합치기?
     async getArchievedPages(ctx, next)
    {
        const params = ctx.query;

        const startIndex = parseInt(params.startIndex);
        if(startIndex < 0) {
            ctx.response.status = 400;
            return;
        }

        try {

            ctx.response.status = 200;
            ctx.body = 'getArchivedPages';
        } catch(e) {
            e.message += `\n        Request parameters: ${JSON.stringify(params)}`;
            throw e;
        }
    }

    async removePage(ctx, next)
    {
        try {
            //await this.core.deletePage(ctx.params.id);

            ctx.status = 204;
        } catch(e) {
            e.message += `\n        Page id: ${ctx.params.id}`;
            throw e;
        }
    }

    async markPageAsRead(ctx, next)
    {
        const params = ctx.request.body;
        let setUnread = false;

        if(params.setUnread && params.setUnread == true) {
            setUnread = true;
        }

        try {
            // await this.core.readPage(ctx.params.id, setUnread);

            ctx.status = 204;
        } catch(e) {
            e.message += `\n        Page id: ${ctx.params.id}`;
            throw e;
        }
    }

    async archieveNewPage(ctx, next)
    {
        const params = ctx.request.body;

        let notExistedParams = [];

        if(!params.url) {
            notExistedParams.push('url');
        }
        if(!params.category) {
            notExistedParams.push('category');
        }
        if(notExistedParams.length > 0) {
            // throw new MissingRequiredParametersError(notExistedParams);
        }

        try {
            // const info: WebPageInfo = await getPageInfo(params.url);
            // info.category = params.category;
            // info.isRead = true;

            // await this.core.archieveNewPage(info);

            ctx.status = 200;
            ctx.body = 'archiveNewPage';
        } catch(e) {
            e.message += `\n        Request parameters: ${JSON.stringify(params)}`;
            throw e;
        }
    }

    async archievePage(ctx, next)
    {
        // await this.core.archievePage(ctx.params.id);

        ctx.status = 204;
    }

    async getSites(ctx, next)
    {
        const res = await this.core.getWebSites();
        
        ctx.status = 200;
        ctx.body = res;
    }

    async addSite(ctx, next)
    {
        const params = ctx.request.body;

        let notExistedParams = [];
        if(!params.title) {
            notExistedParams.push('title');
        }
        if(!params.url) {
            notExistedParams.push('url');
        }
        if(!params.crawlUrl) {
            notExistedParams.push('crawlUrl');
        }
        if(!params.cssSelector) {
            notExistedParams.push('cssSelector');
        }
        if(notExistedParams.length > 0) {
            throw new MissingRequiredParametersError(notExistedParams);
        }

        if(!params.category) {
            params.category = "general";
        }
        if(!params.checkingCycleSec) {
            params.checkingCycleSec = 3600;
        }

        try {
            await this.core.addWebSite({
                id: "",
                title: params.title,
                url: params.url,
                crawlUrl: params.crawlUrl,
                cssSelector: params.cssSelector,
                // category: params.category,
                lastUrl: "",
                // checkingCycleSec: params.checkingCycleSec,
                // isDisabled: false
            });

            ctx.status = 204;
        } catch(e) {
            e.message += `\n        Request parameters: ${JSON.stringify(params)}`;
            throw e;
        }
    }

    async updateSite(ctx, next)
    {
        const params = ctx.request.body;
        
        try {
            await this.core.updateWebSite(ctx.params.id, {
                title: params.title,
                url: params.url,
                crawlUrl: params.crawlUrl,
                cssSelector: params.cssSelector,
                // category: params.category,
                // checkingCycleSec: parseInt(params.checkingCycleSec) || undefined,
                // isDisabled: parseBoolean(params.isDisabled)
            });

            ctx.status = 204;
        } catch(e) {
            e.message += `\n        Request parameters: ${JSON.stringify(params)}`
            throw e;
        }
    }

    async removeSite(ctx, next)
    {
        const params = ctx.request.body;
        
        try {
            await this.core.removeWebSite(ctx.params.id, (params.deleteAllPages == "true"));

            ctx.status = 204;
        } catch(e) {
            e.message += `\n        Request parameters: ${JSON.stringify(params)}`;
            throw e;
        }
    }

    async getCategories(ctx, next)
    {
        const params = ctx.query;

        try {
            let categoryName = '';
            let withSub = true;

            if(params.name) {
                categoryName = params.name;
            }
            if(params.withSub) {
                const temp = parseBoolean(params.withSub);
                if(temp != undefined) {
                    withSub = temp;
                }
            }
            // const r = await this.core.getCategories(categoryName, withSub);

            ctx.status = 200;
            ctx.body = 'getCategories';
        } catch(e) {
            e.message += `\n        Request parameters: ${JSON.stringify(params)}`;
            throw e;
        }
    }

    async addCategory(ctx, next)
    {
        const params = ctx.request.body;

        if(!params.name) {
            throw new MissingRequiredParametersError(['name']);
        }

        try {
            // await this.core.addCategory(params.name);

            ctx.status = 204;
        } catch(e) {
            e.message += `\n        Request parameters: ${JSON.stringify(params)}`;
            throw e;
        }
    }

    async removeCategory(ctx, next)
    {
        const params = ctx.request.body;

        if(!params.name) {
            throw new MissingRequiredParametersError(['name']);
        }

        try {
            // await this.core.deleteCategory(params.name);

            ctx.status = 204;
        } catch(e) {
            e.message += `\n        Request parameters: ${JSON.stringify(params)}`;
            throw e;
        }
    }

}