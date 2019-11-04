import _ from 'lodash'
import fse from 'fs-extra'
import path from 'path'
import crypto from 'crypto'

const normalizeReturnedData = (returnedData) => {
	if (_.isString(returnedData)) {
		return returnedData
	}
	if (_.isObjectLike(returnedData)) {
		return JSON.stringify(returnedData)
	}
	throw new Error(
		`Memoized function must return "string" or "Object"! Got "${typeof returnedData}"`
	)
}

const getArgumentsHache = (...args) => {
	return crypto
		.createHash('md5')
		.update(JSON.stringify(args))
		.digest('hex')
}

/**
 * @decorator
 * 
 * @param {function} func
 * @param {{ name: string, folder: string, maxAge: number, isJson?: boolean, isLazy?: boolean, isDisabled?: boolean }} config
 *
 * @returns {string|Object|Array}
 */
export default function memoizeFuncToFile(func, config) {
	if (Object.keys(config).length < 3) {
		throw new Error('Required config properties must be specified!')
	}

	if (config.isDisabled) {
		return func
	}

	return async function runFunc(...args) {
		const createOrUpdateCacheFile = async () => {
			const returnedData = await func(...args)
			await fse.outputFile(cacheFilePath, normalizeReturnedData(returnedData))
		}
		
		const fileName = `${config.name}_${getArgumentsHache(...args)}.cache`
		const cacheFilePath = path.join(config.folder, fileName)

		if (!(await fse.pathExists(cacheFilePath))) {
			await createOrUpdateCacheFile()
		}

		const fileStat = await fse.lstat(cacheFilePath)
		const currentCacheAgeInMs = Number(new Date()) - fileStat.ctimeMs
		const isCacheAgeExpired = currentCacheAgeInMs > config.maxAge

		if (isCacheAgeExpired && !config.isLazy) {
			await createOrUpdateCacheFile()
		}

		const cachedData = await fse.readFile(cacheFilePath, 'utf8')

		if (isCacheAgeExpired && config.isLazy) {
			/**
			 * Update cache in background, so that we can return it without waiting 
			 * for cache to refresh. And then only next call will get refreshed cache.
			 * Useful when cache freshness is not so important, but speed is.
			 */
			createOrUpdateCacheFile().then()
		}

		return config.isJson ? JSON.parse(cachedData) : cachedData
	}
}
