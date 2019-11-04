import _ from  'lodash' 
import fetch from 'node-fetch'
import HttpsProxyAgent from 'https-proxy-agent'
import mem from 'mem'
import fse from 'fs-extra'
import delay from 'delay'
import { jldb } from 'jldb'
import memoizeToFile from './memoize-to-file'

///////////////////////////////////////////////////////////////////////////////
// User agents
/////////////////////////////////////////////////////////////////////////////// 

const userAgents = {
	chrome: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36`,
	webkit: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_4) AppleWebKit/605.1.15 (KHTML, like Gecko)`,
	firefox: `Mozilla/5.0 (Windows NT 5.1; rv:36.0) Gecko/20100101 Firefox/36.0`,
	googleBot: `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Safari/537.36`,
	yandexbot: `Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)`,
}

///////////////////////////////////////////////////////////////////////////////
// Helpers
/////////////////////////////////////////////////////////////////////////////// 

const getProxyFromFile = async (proxyId, proxiesFilePath) => {
	const data = await fse.readFile(proxiesFilePath, 'utf-8')

	const proxyList = data.split('\n')

	return proxyList[proxyId] ? proxyList[proxyId] : _.last(proxyList)
}

const getProxyFromFileMemoized = mem(getProxyFromFile, {
	maxAge: 60 * 1000, // 1 minute
})

async function getProxy(proxyFile, proxyId, proxyCustom) {
	if (proxyFile) return await getProxyFromFileMemoized(proxyId, proxyFile)
	if (proxyCustom) return proxyCustom
	throw new Error(`"proxyFile" or "proxyCustom" must be specified!`)
}

///////////////////////////////////////////////////////////////////////////////
// Main
/////////////////////////////////////////////////////////////////////////////// 

async function makeRequest(url, initConfig = {}) {
	const {
		proxyFile = './storage/proxy.txt',
		proxyId = 0,
		proxyEnabled = true,
		proxyCustom = false,
		attempt = 1,
		logsFile = './storage/request-errors.json',
		fetchConfig = {},
		type = 'text', // json | blob
	} = initConfig

	fetchConfig.headers = fetchConfig.headers || {}	
	fetchConfig.headers['user-agent'] = userAgents.chrome

	if (proxyEnabled) {
		const proxyUrl = await getProxy(proxyFile, proxyId, proxyCustom)
		// ref: http://tiny.cc/tt03ez
		fetchConfig.agent = new HttpsProxyAgent(proxyUrl)
	}

	try {
		// Redirect currently doensn't wotk in node-fetch 
		const response = await fetch(url, fetchConfig)

		if (!response.ok) { 
			throw new Error(`HTTP request to "${url}" failed with status code: "${response.status}"!`)
		}

		return await response[type]()
	} catch (error) {
		// @todolater - попробовать с другим прокси наверное, до 3-х раз (attempt + 1) (и в случае ошибки - тоже)

		console.error(error)

		await jldb.push(logsFile, { url, attempt, err: error.message })

		throw new Error(error)
	}
}

///////////////////////////////////////////////////////////////////////////////
// Export
/////////////////////////////////////////////////////////////////////////////// 

export async function request(url, initConfig = {}) {
	const { 
		cacheFolder = './storage/request-cache/',
		cacheMaxAge = 1000 * 60 * 60 * 12, // 12 hours,
		cacheDisabled = false,
		wait = 0,
	} = initConfig

	if (process.env.NODE_ENV === 'production') {
		if (wait) {
			await delay(wait)
		}
		return await makeRequest(url, initConfig)
	}

	const memoizedRequest = memoizeToFile(makeRequest, {
		name: 'webpage',
		folder: cacheFolder,
		maxAge: cacheMaxAge,
		isDisabled: cacheDisabled,
	})

	return await memoizedRequest(url, initConfig)
}

export { delay }

export default request