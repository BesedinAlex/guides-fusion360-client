import axios from 'axios';
import {serverURL} from "./server-address";
import Guide from "../interfaces/guide";
import PartGuide from "../interfaces/part-guide";
import {token} from "./user-data";

export function getAllGuides(): Promise<Array<Guide>> {
    return new Promise((resolve, reject) => {
        axios.get(`${serverURL}/guides/all`)
            .then(data => resolve(data.data)).catch(reject);
    });
}

export function getPartGuides(guideId: number): Promise<Array<PartGuide>> {
    return new Promise((resolve, reject) => {
        axios.get(`${serverURL}/guides/parts?guideId=${guideId}`)
            .then(data => resolve(data.data)).catch(err => reject(err.response.data.message));
    });
}

export function postNewGuide(name: string, description: string, img: File) {
    return new Promise((resolve, reject) => {
        const bodyFormData = new FormData();
        bodyFormData.append('name', name);
        bodyFormData.append('description', description);
        bodyFormData.append('img', img);

        axios({
            method: 'post',
            url: `${serverURL}/guides/guide?token=${token}`,
            data: bodyFormData
        }).then(resolve).catch(err => reject(err.response.data.message));
    });
}

export function postNewPartGuide(guideId: number, name: string, file: File | string, sortKey: number) {
    return new Promise((resolve, reject) => {
        const bodyFormData = new FormData();
        bodyFormData.append('guideId', String(guideId));
        bodyFormData.append('name', name);
        bodyFormData.append('file', file);
        bodyFormData.append('sortKey', String(sortKey));

        axios({
            method: 'post',
            url: `${serverURL}/guides/part-guide?token=${token}`,
            data: bodyFormData
        }).then(resolve).catch(err => reject(err.response.data.message));
    });
}

export function putPartGuide(id: number, name: string, file: any, sortKey: number) {
    return new Promise((resolve, reject) => {
        const bodyFormData = new FormData();
        bodyFormData.append('id', String(id));
        bodyFormData.append('name', name);
        bodyFormData.append('file', file);

        axios({
            method: 'put',
            url: `${serverURL}/guides/part-guide?token=${token}`,
            data: bodyFormData
        }).then(resolve).catch(err => reject(err.response.data.message));
    });
}

export function putPartGuidesSortKey(id1: number, id2: number) {
    return new Promise((resolve, reject) => {
        axios.put(`${serverURL}/guides/switch?token=${token}&id1=${id1}&id2=${id2}`)
            .then(resolve).catch(err => reject(err.response.data.message));
    });
}
