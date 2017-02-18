import HashUtility, { SerializedHash } from 'util/hashManager';
import { renderUI, clearUI } from 'applicationRoot/renderUI';
import { store, getNewReducer } from 'applicationRoot/store';
import { createElement } from 'react';

import {setDesktop, setMobile, setModule, setLoggedIn, setPublicInfo, setRequestDesktop, setIsTouch} from './applicationRoot/rootReducerActionCreators';
import 'util/ajaxUtil';

if ('ontouchstart' in window || 'onmsgesturechange' in window){
    store.dispatch(setIsTouch(true));
}

try {
    var desktopRequested = !!localStorage.getItem('useDesktop');
} catch(x){ }

if (window.screen.width < 700) {
    store.dispatch(setMobile());
} else {
    store.dispatch(setDesktop());
}

if (desktopRequested){
    store.dispatch(setRequestDesktop());
}

let currentModule;
let currentModuleObject;
let publicUserCache = {};

window.onhashchange = function () {
    loadCurrentModule();
};

let initial = true;
const validModules = new Set(['books', 'scan', 'home', 'activate', 'view', 'subjects']);

export const globalHashManager = new HashUtility();

loadCurrentModule();
export function loadCurrentModule() {
    let hash = window.location.hash.replace('#', ''),
        originalModule = hash.split('/')[0] || '',
        module = (hash.split('/')[0] || 'home').toLowerCase(),
        publicModule = module === 'view' || module == 'activate';

    let loggedIn = isLoggedIn();

    if (!loggedIn && !publicModule){
        if (originalModule && module != 'home'){
            module = 'authenticate';
        } else {
            module = 'home';
        }
    } else {
        if (!validModules.has(module)){
            window.location.hash = 'books';
            return;
        }
    }

    if (loggedIn){
        store.dispatch(setLoggedIn());
    }

    if (publicModule){
        var userId = globalHashManager.currentParameters.userId;

        //switching to a new public viewing - reload page
        if (!initial && store.getState().app.publicUserId != userId){
            location.reload();
            return;
        }

        var publicUserPromise = userId ? (publicUserCache[userId] || (publicUserCache[userId] = fetchPublicUserInfo(userId))) : null;

        if (module === 'view') {
            module = 'books';
        }
    } else if (store.getState().app.publicUserId){
        //leaving public viewing - reload page
        location.reload();
        return;
    }

    initial = false;

    if (module === currentModule) {
        if (currentModuleObject && currentModuleObject.hashSync) {
            store.dispatch(currentModuleObject.hashSync(globalHashManager.currentParameters));
        }
        return;
    }
    currentModule = module;

    let modulePromise = (() => {
        switch(module.toLowerCase()){
            case 'activate': return (System.import('./modules/activate/activate'));
            case 'authenticate': return (System.import('./modules/authenticate/authenticate'));
            case 'books': return (System.import('./modules/books/books'));
            case 'home': return (System.import('./modules/home/home'));
            case 'scan': return (System.import('./modules/scan/scan'));
            case 'subjects': return (System.import('./modules/subjects/subjects'));
        }
    })();

    Promise.all([
        modulePromise,
        publicUserPromise
    ]).then(([{ default: moduleObject }, publicUserInfo]) => {
        if (currentModule != module) return;
        
        currentModuleObject = moduleObject;
        store.dispatch(setModule(currentModule));

        if (publicUserInfo){
            store.dispatch(setPublicInfo(name, publicUserInfo.booksHeader, userId));
        }

        if (moduleObject.reducer) {
            getNewReducer({name: moduleObject.name, reducer: moduleObject.reducer});
        }
        renderUI(createElement(moduleObject.component));
        if (moduleObject.initialize) {
            store.dispatch(moduleObject.initialize({parameters: globalHashManager.currentParameters }));
        }
    });
}

export function isLoggedIn(){
    return /logged_in/ig.test(document.cookie);
}

export function goHome(){
    let currentModule = globalHashManager.getCurrentHashInfo().module || 'home';
    if (currentModule === 'home') return;
    globalHashManager.setHash(new SerializedHash('home'));
}

function fetchPublicUserInfo(userId){
    return new Promise((res, rej) => {
        ajaxUtil.post('/user/getPubliclyAvailableUsersName', { _id: userId }, resp => {
            res({ name: resp.name, booksHeader: resp.booksHeader  })
        })
    });
}