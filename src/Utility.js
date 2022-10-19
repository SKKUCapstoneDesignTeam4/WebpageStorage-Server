export function relToAbsUrl(url, baseUrl)
{
    const absRegex = /^(?:[a-z]+:)?\/\//i;

    if(absRegex.test(url) == true) {
        return url;
    } else {
        const u = new URL(url, baseUrl);
        return u.toString();
    }
}
