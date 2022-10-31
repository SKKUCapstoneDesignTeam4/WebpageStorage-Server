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
import { InvalidRequestError } from "./Error.js";

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
                if(err instanceof InvalidRequestError) {
                    ctx.status = err.statusCode;
                    ctx.body = err.responseMessage;
                } else {
                    ctx.status = 500;
                    ctx.app.emit("error", err, ctx);
                }
            }
        });

        this.koaApp.on("error", (err, ctx) => {
            logger.error(`APIServer: Error in ${ctx.request.method}:${ctx.request.url}\n        ${err.stack}\n ${err.message}`);
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
        router.delete("/api/page/:id", this.removePage.bind(this));
        router.put("/api/page/read/:id", this.markPageAsRead.bind(this));

        router.get("/api/sites", this.getSites.bind(this));
        router.post("/api/site", this.addSite.bind(this));
        router.put("/api/site/:id", this.updateSite.bind(this));
        router.delete("/api/site/:id", this.removeSite.bind(this));

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
    
    // POST: /api/register
    async register(ctx, next)
    {
        const params = ctx.request.body;
        this.checkRequiredParams(params, ["id", "password"]);

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

    // POST: /api/auth
    async auth(ctx, next)
    {
        const params = ctx.request.body;
        this.checkRequiredParams(params, ["id", "password"]);

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

    // GET: /api/auth/check
    async checkAuth(ctx, next)
    {
        ctx.response.status = 200;
    }

    // POST: /api/auth/refresh
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

    // GET: /api/pages
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

    // DELETE: /api/page/:id
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

    // PUT: /api/page/read/:id
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

    // GET: /api/sites
    async getSites(ctx, next)
    {
        const res = await this.core.getWebSites(ctx.state.userId);
        
        ctx.status = 200;
        ctx.body = res;
    }

    // POST: /api/site
    async addSite(ctx, next)
    {
        const params = ctx.request.body;
        this.checkRequiredParams(params, ["title", "url", "crawlUrl", "cssSelector"])

        try {
            await this.core.addWebSite({
                id: "",
                title: params.title,
                url: params.url,
                crawlUrl: params.crawlUrl,
                cssSelector: params.cssSelector,
                lastUrl: "",
                ownerUserId: ctx.state.userId
            });

            ctx.status = 204;
        } catch(e) {
            e.message += `\n        Request parameters: ${JSON.stringify(params)}`;
            throw e;
        }
    }

    // PUT: /api/site/:id
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

    // DELETE: /api/site/:id
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

    // ===================

    checkRequiredParams(params, requiredParamNames) {
        let notExistedParams = [];
        requiredParamNames.forEach(function(name) {
            if(!(name in params)) {
                notExistedParams.push(name);
            }
        });

        if(notExistedParams.length > 0) {
            throw new InvalidRequestError(`MissingRequiredParametersError (${notExistedParams.join(", ")})`, 400);
        }
    }
}
