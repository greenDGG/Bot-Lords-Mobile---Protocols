export interface IggAccountTokenData {
  iggid: number;
  access_token: string;
  token_info?: TokenInfo;
  sso_token?: SsoToken;
}

export interface TokenInfo {
  type: string;
  key: string;
  game_id: number;
  device_id: string;
  version: string;
  lifecycle: number;
}

export interface SsoToken {
  token: string;
  created_at: number;
  expires_at: number;
}

export interface IggApiError {
  code: number;
  message: string;
}

export interface IggApiResponse {
  data?: IggAccountTokenData;
  error?: IggApiError;
}

export interface AccountRecord {
  iggId: number;
  accessKey?: string;
  uuid?: string;
  email?: string;
  device?: DeviceData;
  ssoToken?: SsoToken;
  gameId: string;
  proxyAddress?: string;
}

export interface DeviceData {
  uuid: string;
  udid: string;
  adid: string;
  loginType: string;
  serialNO: string;
  buildNO: string;
  operator: string;
  manufacturer: string;
  osVersion: string;
  model: string;
  androidID: string;
  country: string;
  timezone: string;
}

export function createDevice(): DeviceData {
  return {
    uuid: crypto.randomUUID().replace(/-/g, ''),
    udid: crypto.randomUUID().replace(/-/g, '').toUpperCase(),
    adid: crypto.randomUUID().replace(/-/g, ''),
    loginType: 'guest',
    serialNO: 'unknown',
    buildNO: 'LM_Steam_1.0',
    operator: 'unknown',
    manufacturer: 'PC',
    osVersion: 'Windows 11',
    model: 'PC',
    androidID: crypto.randomUUID().replace(/-/g, ''),
    country: 'US',
    timezone: (-new Date().getTimezoneOffset() / 60).toFixed(1),
  };
}

import * as crypto from 'crypto';
