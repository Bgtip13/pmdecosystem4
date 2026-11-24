// Penanda "login sudah dicatat" untuk sesi aplikasi HP (hidup selama proses aplikasi berjalan).
let loggedThisSession = false;

export const loginAlreadyLogged = () => loggedThisSession;
export const markLoginLogged = () => { loggedThisSession = true; };
export const resetLoginLogged = () => { loggedThisSession = false; };
