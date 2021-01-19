import { merge, get } from 'lodash-es'
import urlparse from 'url-parse'
import {
  ElementQuery,
  searchFilter,
  SelectorCollection,
  SiteConfig,
  SiteMetadata,
  Torrent,
  UserInfo
} from '@/shared/interfaces/sites'
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios'
import urljoin from 'url-join'

// 适用于公网BT站点，同时也作为 所有站点方法 的基类
export abstract class BittorrentSite {
  protected abstract siteMetadata: SiteMetadata;
  protected userConfig: Partial<SiteConfig>;

  private _config?: SiteConfig;

  constructor (config: Partial<SiteConfig> = {}) {
    this.userConfig = config
  }

  /**
   * 获得运行时配置
   */
  get config (): SiteConfig {
    if (!this._config) {
      // 使用 lodash 的 merge 来合并站点默认配置和用户配置
      // 以免 { ...data } 解包形式覆盖深层配置
      this._config = merge(this.siteMetadata, this.userConfig) as SiteConfig

      // 防止host信息缺失
      if (!this._config.host) {
        this._config.host = urlparse(this.siteMetadata.url).host
      }
    }

    return this._config
  }

  get activateUrl (): string {
    if (this.config.activateUrl) {
      return this.config.activateUrl
    }
    return this.config.url
  }

  // noinspection JSUnusedGlobalSymbols
  /**
   * 种子搜索方法
   * @param filter
   */
  async searchTorrents (filter: searchFilter) : Promise<Torrent[]> {
    // 请求页面并转化为document
    const axiosConfig = this.transformSearchFilter(filter)
    axiosConfig.responseType = this.config.search?.type || 'document'

    const req = await this.request(axiosConfig)
    return this.transformSearchPage(req.data)
  }

  async request (axiosConfig: AxiosRequestConfig): Promise<AxiosResponse> {
    // 统一设置一些 AxiosRequestConfig
    if (!axiosConfig.baseURL) {
      axiosConfig.baseURL = this.activateUrl
    }

    let req: AxiosResponse
    try {
      req = await axios.request(axiosConfig)
    } catch (e) {
      req = (e as AxiosError).response!
      if (req.status > 400) {
        throw Error('网络请求失败') // FIXME i18n
      }
    }

    if (!this.loggedCheck(req)) {
      throw Error('未登录') // FIXME i18n
    }

    return req
  }

  /**
   * @warning 此方法不可以在 getFieldData 的 filters 中使用
   * @param uri
   */
  protected fixLink (uri: string): string {
    let url = uri

    if (uri.startsWith('//')) {
      const urlHelper = urlparse(this.activateUrl)
      url = `${urlHelper.protocol}:${uri}`
    } if (!uri.startsWith('magnet:') && uri.substr(0, 4) !== 'http') {
      url = urljoin(this.activateUrl, uri)
    }
    return url
  }

  protected getFieldData (element: Element | Document | Object, elementQuery: ElementQuery): string | number {
    const { selector, attribute, data, filters } = elementQuery

    let selectors = selector
    if (typeof selector === 'string') {
      selectors = [selector]
    }

    let query: string = ''
    for (let i = 0; i < selectors.length; i++) {
      if (element instanceof HTMLElement) {
        const another = element.querySelector(selectors[i]) as HTMLElement
        if (another) {
          if (data) {
            query = another.dataset[data] || ''
          } else if (attribute) {
            query = another.getAttribute(attribute) || ''
          } else {
            query = another.innerText || ''
          }
        }
      } else {
        query = get(element, selector)
      }

      query = query.trim()
      if (filters) {
        filters.forEach(fn => {
          // eslint-disable-next-line no-new-func
          query = typeof fn === 'string' ? Function(fn)() : fn(query)
        })
      }

      if (query !== '') {
        break
      }
    }

    return query
  }

  protected transformRowsTorrent (row: Element | Document | Object, selectorType: SelectorCollection = 'search'): Partial<Torrent> {
    const torrent = {} as Partial<Torrent>

    for (const key in this.config.selector[selectorType]) {
      // noinspection JSUnfilteredForInLoop
      let value = this.getFieldData(row, this.config.selector[selectorType]![key])
      // noinspection JSUnfilteredForInLoop
      if (['url', 'link'].includes(key)) {
        value = this.fixLink(value as string)
      }
      // @ts-ignore
      // noinspection JSUnfilteredForInLoop
      torrent[key] = value
    }
    return torrent
  }

  /**
   * 登录检查方法，对于公开站点，该方法一定直接返回 True
   * @param raw
   */
  protected loggedCheck (raw: AxiosResponse): boolean {
    return true
  }

  /**
   * 根据搜索筛选条件，生成 AxiosRequestConfig
   * @param filter
   */
  abstract transformSearchFilter(filter: searchFilter): AxiosRequestConfig;

  /**
   * 如何解析 JSON 或者 Document，获得种子文件
   * @param doc
   */
  abstract transformSearchPage(doc: any): Torrent[];

  /**
   * 根据种子id信息生成对应种子介绍页面
   * @param id
   */
  abstract generateDetailPageLink(id: any): string;
}

// 适用于PT站点
export abstract class PrivateSite extends BittorrentSite {
  // noinspection JSUnusedGlobalSymbols
  /**
   * 获得当前站点最新的用户信息用于更新
   */
  abstract getUserInfo(): Promise<UserInfo> ;

  abstract ping (): Promise<boolean> ;

  /**
   * 这是一个比较通用的检查是否登录方法，如果不行请考虑覆写扩展
   * @param {AxiosResponse} res
   */
  protected loggedCheck (res: AxiosResponse): boolean {
    const request = res.request as XMLHttpRequest
    if (/login|verify|checkpoint|returnto/ig.test(request.responseURL)) {
      return false // 检查最终的URL看是不是需要登陆
    } else if (res.headers.refresh && /\d+; url=.+(login|verify|checkpoint|returnto).+/ig.test(res.headers.refresh)) {
      return false // 检查responseHeader有没有重定向
    } else {
      const responseText = request.responseText
      if (typeof responseText === 'undefined') {
        return false // 检查最终的Text，如果什么都没有也可能说明需要登陆
      } else if (responseText.length < 800 && /login|not authorized/.test(responseText)) {
        return false // 对Text进行检查，断言 “过短，且中间出现login等字段“ 说明可能需要登陆
      }
    }
    return true
  }
}