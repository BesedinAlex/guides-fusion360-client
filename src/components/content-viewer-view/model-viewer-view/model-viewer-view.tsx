import React, {Component} from 'react';
import {RouteComponentProps} from "react-router";
import {Link, Redirect} from "react-router-dom";
import * as THREE from 'three';
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls";
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader';
import {DRACOLoader} from "three/examples/jsm/loaders/DRACOLoader";
import {ModelAnnotation} from "../../../types";
import {deleteModelAnnotation, getModelAnnotations, postModelAnnotation} from "../../../api/model-annotations";
import {getGuideFile} from "../../../api/guides";
import {userAccess} from "../../../api/user-data";
import './model-viewer-view.sass';
import './../content-viewer-view.sass';
import {addModelFile, getModelFile} from "../../../services/loaded-files";

interface State {
    modelId: number;
    annotations: ModelAnnotation[];
    redirect: boolean;
    mode: string;
    annotationName: string;
    annotationText: string;
    modelLoaded: boolean;
}

export default class ModelViewerView extends Component<RouteComponentProps, State> {

    private _isMounted: boolean;
    private host: HTMLElement;
    private scene: THREE.Scene;
    private renderer: THREE.WebGLRenderer;
    private camera: THREE.PerspectiveCamera;
    private controls: OrbitControls;
    private raycaster: THREE.Raycaster;
    private mouse: THREE.Vector2;
    private animationId: number;

    state = {
        modelId: null,
        annotations: [],
        redirect: false,
        mode: 'view',
        annotationName: '',
        annotationText: '',
        modelLoaded: false
    };

    async componentDidMount() {
        this._isMounted = true;
        // @ts-ignore
        const modelId = Number(this.props.match.params.id);
        this.setState({modelId});
        let model = getModelFile(modelId);
        if (model === null) {
            try {
                model = await getGuideFile(modelId, 'model.glb');
                addModelFile(modelId, model);
            } catch (message) {
                alert(message);
                this._isMounted && this.setState({redirect: true});
                return;
            }
        } else {
            // If the model is preloaded, it will not give a chance for a host to initialize before I will use it later
            // in this method. That's why I need to free thread from here so render() could run before it proceeds here.
            await (1);
        }
        this._isMounted && this.setState({modelLoaded: true});

        this.scene = new THREE.Scene();

        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);

        const keyLight = new THREE.DirectionalLight(new THREE.Color('hsl(30, 100%, 75%)'), 1.0);
        keyLight.position.set(-100, 0, 100);
        this.scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(new THREE.Color('hsl(240, 100%, 75%)'), 0.75);
        fillLight.position.set(100, 0, 100);
        this.scene.add(fillLight);

        const backLight = new THREE.DirectionalLight(0xffffff, 1.0);
        backLight.position.set(100, 0, -100).normalize();
        this.scene.add(backLight);

        this.renderer = new THREE.WebGLRenderer({antialias: true});
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(new THREE.Color(0xffffff));
        this.host.appendChild(this.renderer.domElement);

        this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100000);
        this.camera.position.set(225, 150, 375);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        const gltfLoader = new GLTFLoader();
        gltfLoader.setDRACOLoader(new DRACOLoader().setDecoderPath(`https://www.gstatic.com/draco/v1/decoders/`));
        gltfLoader.load(model, loadedGLTF => {
            if (!this._isMounted)
                return;

            loadedGLTF.scene.children.map(obj => this.scene.add(obj));

            // Center any model
            const modelBoundingBox = new THREE.Box3().setFromObject(this.scene);
            const sizeX = modelBoundingBox.max.x - modelBoundingBox.min.x;
            const sizeY = modelBoundingBox.max.y - modelBoundingBox.min.y;
            const sizeZ = modelBoundingBox.max.z - modelBoundingBox.min.z;
            const objectSize = Math.max(sizeY, sizeX);
            const offset = objectSize / (2 * Math.tan(this.camera.fov * (Math.PI / 360)));
            this.camera.position.set(offset, offset, offset);
            this.controls.target = modelBoundingBox.getCenter(new THREE.Vector3(sizeX, sizeY, sizeZ));
        });

        this.animate();

        window.addEventListener('resize', this.onWindowResize);

        this.getAnnotations();
    }

    componentWillUnmount() {
        this._isMounted = false;

        if (this.scene === undefined) {
            return;
        }

        // Disposing of all viewer objects that can be disposed
        cancelAnimationFrame(this.animationId);
        this.controls.dispose();
        this.renderer.domElement.addEventListener('dblclick', null, false);
        this.renderer.dispose();
        window.removeEventListener('resize', this.onWindowResize);

        const disposeObj = (obj) => {
            if (obj.children) {
                obj.children.map(child => disposeObj(child));
            }

            if (obj.geometry) {
                obj.geometry.dispose();
            }

            if (obj.material) {
                if (obj.material.map) {
                    obj.material.map.dispose();
                }
                obj.material.dispose();
            }
        }
        this.scene.traverse(obj => disposeObj(obj));

        this.animationId = undefined;
        this.mouse = undefined;
        this.raycaster = undefined;
        this.controls = undefined;
        this.camera = undefined;
        this.renderer = undefined;
        this.scene = undefined;
        this.host = undefined;
    }


    animate = () => {
        this.animationId = requestAnimationFrame(this.animate);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        const width = this.renderer.domElement.width / 2 / window.devicePixelRatio;
        const height = this.renderer.domElement.height / 2 / window.devicePixelRatio;

        // Annotations
        for (const obj of this.state.annotations as Array<ModelAnnotation>) {
            const p2 = new THREE.Vector3(obj.x, obj.y, obj.z);
            const annotation = document.querySelector('#annotation-' + obj.index) as HTMLFormElement;
            const annotationIndex = document.querySelector('#annotation-index-' + obj.index) as HTMLFormElement;
            p2.project(this.camera);
            p2.x = Math.round((p2.x + 1) * width);
            p2.y = Math.round((-p2.y + 1) * height);
            annotation.style.left = p2.x + 'px';
            annotation.style.top = p2.y + 'px';
            annotationIndex.style.left = p2.x - 15 + 'px';
            annotationIndex.style.top = p2.y - 15 + 'px';
        }
        this.changeVisibilityByDistanceOfAnnotations();
    };

    onWindowResize = () => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    };

    handleAddAnnotation = event => {
        event.preventDefault();
        if (this.state.mode === 'annotate') {
            this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObjects(this.scene.children, true);
            if (intersects.length !== 0) {
                if (this.state.annotationName === '') {
                    alert('Необходимо ввести имя аннотации.');
                    return;
                }
                const currentPoint = intersects[0].point;
                const {x, y, z} = currentPoint;
                const {modelId, annotationName, annotationText} = this.state;
                postModelAnnotation(modelId, x, y, z, annotationName, annotationText)
                    .then(() => this.getAnnotations())
                    .catch(message => alert(message));
            }
        }
    };

    getAnnotations = () => {
        this.setState({annotations: []});
        getModelAnnotations(this.state.modelId)
            .then(annotations => {
                annotations.map((annotation, i) => annotation.index = i + 1);
                this._isMounted && this.setState({annotations});
            })
            .catch(message => console.log(message));
    }

    hideAnnotation(index: number) {
        const annotation = document.querySelector('#annotation-' + index);
        const hidden: boolean = annotation.classList.contains('hidden');
        if (hidden) {
            annotation.classList.remove('hidden');
        } else {
            annotation.classList.add('hidden');
        }
    }

    getClosestAnnotation() {
        let indexOfClosest;
        let distToClosest = Number.MAX_VALUE;
        for (const obj of this.state.annotations) {
            const camPos = this.camera.position;
            const dist = Math.sqrt(Math.pow((camPos.x - obj.x), 2) + Math.pow((camPos.y - obj.y), 2) + Math.pow((camPos.z - obj.z), 2));
            if (distToClosest > dist) {
                distToClosest = dist;
                indexOfClosest = obj.index;
            }
        }
        return indexOfClosest;
    }

    changeVisibilityByDistanceOfAnnotations() {
        for (const obj of this.state.annotations) {
            const annotation = document.querySelector('#annotation-' + obj.index) as HTMLFormElement;
            const annotationNumber = document.querySelector('#annotation-index-' + obj.index) as HTMLFormElement;
            annotation.style.zIndex = this.getClosestAnnotation() === obj.index ? '1' : '0';
            annotationNumber.style.zIndex = this.getClosestAnnotation() === obj.index ? '1' : '0';
        }
    }

    handleAnnotationNameChange = e => this.setState({annotationName: e.target.value});

    handleAnnotationTextChange = e => this.setState({annotationText: e.target.value});

    handleDeleteAnnotationClick = id => deleteModelAnnotation(id).catch(message => alert(message));

    annotationButtonClicked = () => this.setState({mode: this.state.mode === 'view' ? 'annotate' : 'view'});

    annotationsMenu = () => {
        if (this.state.mode === 'annotate') {
            return (
                <div className="annotations-create-container">
                    <div className="annotations-create">
                        <label>Новая аннотация</label>
                        <input type="text" id="name" className="form-control" placeholder="Имя аннотации"
                               onChange={this.handleAnnotationNameChange} />
                        <textarea className="form-control my-2" rows={5} maxLength={255} placeholder="Текст аннотации"
                                  onChange={this.handleAnnotationTextChange} />
                        <p className="m-0">
                            Введите имя и текст аннотации и нажмите туда, где вы хотите её поставить.
                        </p>
                    </div>
                </div>
            );
        }
    }

    viewerButtons = () => (
        <div>
            <Link to="/" className="viewer-btn model-viewer-home">
                <img className="viewer-btn-img" src={require('../../../assets/home.png')}
                     alt="Return to home page" />
            </Link>
            <Link to={`/guide/${this.state.modelId}`} className="viewer-btn model-viewer-return">
                <img className="viewer-btn-img" src={require('../../../assets/return.png')}
                     alt="Return to guide page" />
            </Link>

            <div hidden={userAccess !== 'editor' && userAccess !== 'admin'}
                 className="viewer-btn model-viewer-annotate" onClick={this.annotationButtonClicked}>
                <img className="viewer-btn-img" src={require('../../../assets/annotate.png')}
                     alt="Add annotation window" />
            </div>
        </div>
    );


    render() {
        if (this.state.redirect) {
            return <Redirect to={`/guide/${this.state.modelId}`} />;
        }

        if (!this.state.modelLoaded) {
            return (
                <div className="margin-after-header">
                    {this.viewerButtons()}
                    <h3 className="d-flex justify-content-center">Загрузка модели...</h3>
                </div>
            );
        }

        return (
            <div className="viewer" ref={(host) => this.host = host} onClick={this.handleAddAnnotation}>

                {this.viewerButtons()}

                {this.annotationsMenu()}

                {this.state.annotations.map(annotation => {
                    const i = annotation.index;
                    return (
                        <div id={`annotation-${i}`} className="annotation hidden" key={i}>
                            <h6>{annotation.name}</h6>
                            <p className="my-1">{annotation.text}</p>
                            <button hidden={userAccess !== 'editor' && userAccess !== 'admin'}
                                    className="btn btn-danger btn-sm" onClick={() => {
                                this.handleDeleteAnnotationClick(annotation.id)
                                    .then(() => this.getAnnotations())
                                    .catch(message => alert(message));
                            }}>
                                Удалить аннотацию
                            </button>
                        </div>
                    );
                })}

                {this.state.annotations.map(annotation => {
                    const i = annotation.index;
                    return (
                        <div id={`annotation-index-${i}`} className="annotation-number" key={i}
                             onClick={() => this.hideAnnotation(i)}>
                            {i}
                        </div>
                    );
                })}
            </div>
        );
    }
}
