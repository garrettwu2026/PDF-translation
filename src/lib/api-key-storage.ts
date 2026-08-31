export const LOCAL_STORAGE_KEY_NAME = '__pdf_translator_api_key_v1__';
export const LOCAL_STORAGE_OPENAI_KEY_NAME = '__pdf_translator_openai_api_key_v1__';
export const SESSION_STORAGE_KEY_NAME = '__pdf_translator_api_key_session_v1__';
export const SESSION_STORAGE_OPENAI_KEY_NAME = '__pdf_translator_openai_api_key_session_v1__';

type KeyStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// Encoding only prevents accidental plain-text display in storage tools. It is
// not encryption; session storage is therefore the safe default.
export const encodeStoredKey = (key: string) => btoa(key.split('').reverse().join(''));

export const decodeStoredKey = (key: string) => {
  try {
    return atob(key).split('').reverse().join('');
  } catch {
    return '';
  }
};

export const readStoredKey = (
  sessionName: string,
  localName: string,
  session: KeyStorage = window.sessionStorage,
  local: KeyStorage = window.localStorage,
) => {
  const saved = session.getItem(sessionName) ?? local.getItem(localName);
  return saved ? decodeStoredKey(saved) : '';
};

export const persistStoredKey = (
  key: string,
  sessionName: string,
  localName: string,
  rememberOnDevice: boolean,
  session: KeyStorage = window.sessionStorage,
  local: KeyStorage = window.localStorage,
) => {
  session.removeItem(sessionName);
  local.removeItem(localName);
  if (!key) return;
  const target = rememberOnDevice ? local : session;
  target.setItem(rememberOnDevice ? localName : sessionName, encodeStoredKey(key));
};
