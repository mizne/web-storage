import { Injectable, Inject } from '@angular/core'
import { ms } from './ms'
import { Subject } from 'rxjs'

import {
  ANGULAR_WEB_STORE_CONFIG,
  AngularWebStoreConfig,
  ActionNotifyOptions,
  Actions,
  SetAction,
  GetAction,
  RemoveAction,
  ClearAction
} from './storage.config'

import {
  AngularWebStoreError,
  SESSION_STORAGE_NOT_SUPPORTED,
  LOCAL_STORAGE_NOT_SUPPORTED,
  UNKNOWN_STORAGE_TYPE
} from './storage.errors'

export enum StorageType {
  LOCAL = 'localStorage',
  SESSION = 'sessionStorage'
}

const EXPIRED_AT = '@@EXPIRED_AT'
const STOREAGE_VALUE = '@@STORAGE_VALUE'
const EXPIRED_MS = '@@EXPIRED_MS'

export class StorageService {
  private storage: Storage
  private prefix: string
  private expiredMs: number
  private keepAlive: boolean
  private actionNotify: ActionNotifyOptions

  public errors: Subject<AngularWebStoreError> = new Subject<
    AngularWebStoreError
  >()
  public actions: Subject<Actions> = new Subject<Actions>()

  constructor(
    private storageType: StorageType,
    private config: AngularWebStoreConfig
  ) {
    this.initConfig(config)
    this.initStorage(storageType)
  }
  /**
   * set key,value to storage
   *
   * @param {string} key
   * @param {*} value
   * @param {string} [expiredIn] ex: '3ms' '4s' '5m' '6h' '7d' '8y'
   * @memberof StorageService
   */
  set(key: string, value: any, expiredIn?: string): void {
    this.notifyAction(SetAction.TYPE, new SetAction(key, value, expiredIn))

    const expiredMs = this.computeExpiredMs(expiredIn)
    this.storage.setItem(
      this.computeKey(key),
      JSON.stringify({
        [EXPIRED_MS]: expiredMs,
        [EXPIRED_AT]: expiredMs === -1 ? -1 : +new Date() + expiredMs,
        [STOREAGE_VALUE]: value
      })
    )
  }
  /**
   * get value from storage of key
   *
   * @param {string} key
   * @returns {*}
   * @memberof StorageService
   */
  get(key: string): any {
    this.notifyAction(GetAction.TYPE, new GetAction(key))
    try {
      const obj = JSON.parse(
        this.storage.getItem(this.computeKey(key)) || 'null'
      )
      if (this.isValidValue(obj)) {
        if (this.unExpired(obj[EXPIRED_AT])) {
          const value = obj[STOREAGE_VALUE]
          if (obj[EXPIRED_AT] !== -1 && this.keepAlive) {
            this.set(key, value, String(obj[EXPIRED_MS]) + 'ms')
          }
          return value
        } else {
          this.storage.removeItem(this.computeKey(key))
          return null
        }
      }
      return null
    } catch (e) {
      return null
    }
  }
  /**
   * remove value from storage of key
   *
   * @param {string} key
   * @memberof StorageService
   */
  remove(key: string): void {
    this.notifyAction(RemoveAction.TYPE, new RemoveAction(key))
    this.storage.removeItem(this.computeKey(key))
  }
  /**
   * clear all storage
   *
   * @memberof StorageService
   */
  clear(): void {
    this.notifyAction(ClearAction.TYPE, new ClearAction())
    this.storage.clear()
  }

  private initConfig(config: AngularWebStoreConfig): void {
    this.prefix = config.prefix || 'MIZNE'
    this.expiredMs = config.expiredIn ? ms(config.expiredIn) : -1
    this.actionNotify = config.actionNotify || {}
    this.keepAlive = config.keepAlive || false
  }

  private initStorage(storageType: StorageType): void {
    switch (storageType) {
      case StorageType.LOCAL:
        if (this.checkSupport(storageType)) {
          this.storage = window[storageType]
        } else {
          this.errors.next(LOCAL_STORAGE_NOT_SUPPORTED)
        }
        break
      case StorageType.SESSION:
        if (this.checkSupport(storageType)) {
          this.storage = window[storageType]
        } else {
          this.errors.next(SESSION_STORAGE_NOT_SUPPORTED)
        }
        break
      default:
        this.errors.next(UNKNOWN_STORAGE_TYPE)
        break
    }
  }

  private checkSupport(storageType: StorageType): boolean {
    try {
      if (storageType in window && window[storageType] !== null) {
        const webStorage = window[storageType]
        const key = `${this.prefix}_CHECK_SUPPORT`
        webStorage.setItem(key, '')
        webStorage.removeItem(key)
        return true
      }
    } catch (e) {
      this.errors.next({ code: 500, message: e.message })
    }
    return false
  }

  private computeExpiredMs(expiredIn: string): number {
    return expiredIn ? ms(expiredIn) : this.expiredMs
  }

  private computeKey(originalKey: string): string {
    return `${this.prefix}__${originalKey}`
  }

  private isValidValue(obj: any): boolean {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      typeof obj[EXPIRED_AT] === 'number'
    )
  }

  private unExpired(mills: number): boolean {
    return mills === -1 || mills >= +new Date()
  }

  private notifyAction(action: string, actionArgs: Actions): void {
    if (this.actionNotify[action]) {
      try {
        this.actions.next(actionArgs)
      } catch (e) {
        this.errors.next({ code: 500, message: e.message })
      }
    }
  }
}

@Injectable()
export class LocalStorageService extends StorageService {
  constructor(@Inject(ANGULAR_WEB_STORE_CONFIG) config: AngularWebStoreConfig) {
    super(StorageType.LOCAL, config)
  }
}

@Injectable()
export class SessionStorageService extends StorageService {
  constructor(@Inject(ANGULAR_WEB_STORE_CONFIG) config: AngularWebStoreConfig) {
    super(StorageType.SESSION, config)
  }
}
