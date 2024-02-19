import { Object3D, Vector3 } from 'three';

const _tempAxis = new Vector3();

class URDFBase extends Object3D {

    constructor(...args) {

        super(...args);
        this.urdfNode = null;
        this.urdfName = '';

    }

    copy(source, recursive) {

        super.copy(source, recursive);

        this.urdfNode = source.urdfNode;
        this.urdfName = source.urdfName;

        return this;

    }

}

class URDFCollider extends URDFBase {

    constructor(...args) {

        super(...args);
        this.isURDFCollider = true;
        this.type = 'URDFCollider';

    }

}

class URDFVisual extends URDFBase {

    constructor(...args) {

        super(...args);
        this.isURDFVisual = true;
        this.type = 'URDFVisual';

    }

}

class URDFLink extends URDFBase {

    constructor(...args) {

        super(...args);
        this.isURDFLink = true;
        this.type = 'URDFLink';

    }

}

class URDFJoint extends URDFBase {

    get jointType() {

        return this._jointType;

    }

    set jointType(v) {

        if (this.jointType === v) return;
        this._jointType = v;
        this.matrixWorldNeedsUpdate = true;
        switch (v) {

            case 'fixed':
                this.jointValue = [];
                break;

            case 'continuous':
            case 'revolute':
            case 'prismatic':
                this.jointValue = new Array(1).fill(0);
                break;

            case 'planar':
                // Planar joints rotate about their Z axis
                this.axis = new Vector3(0, 0, 1);
                this.jointValue = new Array(3).fill(0);
                break;

            case 'floating':
                this.jointValue = new Array(6).fill(0);
                break;

        }

    }

    get angle() {

        return this.jointValue[0];

    }

    constructor(...args) {

        super(...args);

        this.isURDFJoint = true;
        this.type = 'URDFJoint';

        this.jointValue = null;
        this.jointType = 'fixed';
        this.axis = new Vector3(1, 0, 0);
        this.limit = { lower: 0, upper: 0 };
        this.ignoreLimits = false;

        this.origPosition = null;
        this.origQuaternion = null;

        this.mimicJoints = [];

    }

    /* Overrides */
    copy(source, recursive) {

        super.copy(source, recursive);

        this.jointType = source.jointType;
        this.axis = source.axis.clone();
        this.limit.lower = source.limit.lower;
        this.limit.upper = source.limit.upper;
        this.ignoreLimits = false;

        this.jointValue = [...source.jointValue];

        this.origPosition = source.origPosition ? source.origPosition.clone() : null;
        this.origQuaternion = source.origQuaternion ? source.origQuaternion.clone() : null;

        this.mimicJoints = [...source.mimicJoints];

        return this;

    }

    /* Public Functions */
    /**
     * Set the value or values of this joint
     * @param {...number} values One value per degree of freedom of the joint
     * @returns {boolean} Whether the value was updated
     */
    setJointValue(...values) {

        values = values.map(v => parseFloat(v));

        if (!this.origPosition || !this.origQuaternion) {

            this.origPosition = this.position.clone();
            this.origQuaternion = this.quaternion.clone();

        }

        let didUpdate = false;

        this.mimicJoints.forEach(joint => {

            didUpdate = joint.updateFromMimickedJoint(...values) || didUpdate;

        });

        switch (this.jointType) {

            case 'fixed': {

                return didUpdate;

            }
            case 'continuous':
            case 'revolute': {

                let angle = values[0];
                if (angle == null) return didUpdate;
                if (angle === this.jointValue[0]) return didUpdate;

                if (!this.ignoreLimits && this.jointType === 'revolute') {

                    angle = Math.min(this.limit.upper, angle);
                    angle = Math.max(this.limit.lower, angle);

                }

                this.quaternion
                    .setFromAxisAngle(this.axis, angle)
                    .premultiply(this.origQuaternion);

                if (this.jointValue[0] !== angle) {

                    this.jointValue[0] = angle;
                    this.matrixWorldNeedsUpdate = true;
                    return true;

                } else {

                    return didUpdate;

                }

            }

            case 'prismatic': {

                let pos = values[0];
                if (pos == null) return didUpdate;
                if (pos === this.jointValue[0]) return didUpdate;

                if (!this.ignoreLimits) {

                    pos = Math.min(this.limit.upper, pos);
                    pos = Math.max(this.limit.lower, pos);

                }

                this.position.copy(this.origPosition);
                _tempAxis.copy(this.axis).applyEuler(this.rotation);
                this.position.addScaledVector(_tempAxis, pos);

                if (this.jointValue[0] !== pos) {

                    this.jointValue[0] = pos;
                    this.matrixWorldNeedsUpdate = true;
                    return true;

                } else {

                    return didUpdate;

                }

            }

            case 'floating':
                // TODO: Support these joint types
                console.warn(`'${ this.jointType }' joint not yet supported`);
                break;
            case 'planar':
                // no-op if all values are identical to existing value
                // TODO: this generic implementation of this check could be hoisted higher in the function if we want?
                if (this.jointValue.every((value, index) => values[index] === value)) return didUpdate;

                // Planar joints have three degrees of freedom: X distance, Y distance, and Z rotation.
                const posX = values[0];
                const posY = values[1];
                const rotZ = values[2];

                // Respect existing RPY when modifying the position of the X,Y axes
                this.position.copy(this.origPosition);
                if (posX !== null) {
                    _tempAxis.copy(new Vector3(1, 0, 0)).applyEuler(this.rotation);
                    this.position.addScaledVector(_tempAxis, posX);
                    this.jointValue[0] = posX;
                    didUpdate = true;
                    this.matrixWorldNeedsUpdate = true;
                }
                if (posY !== null) {
                    _tempAxis.copy(new Vector3(0, 1, 0)).applyEuler(this.rotation);
                    this.position.addScaledVector(_tempAxis, posY);
                    this.jointValue[1] = posY;
                    didUpdate = true;
                    this.matrixWorldNeedsUpdate = true;
                }
                if (rotZ !== null) {
                    // Apply the rotation DoF about the Z axis
                    this.quaternion
                        .setFromAxisAngle(this.axis, rotZ)
                        .premultiply(this.origQuaternion);
                    this.jointValue[2] = rotZ;
                    didUpdate = true;
                    this.matrixWorldNeedsUpdate = true;
                }

                return didUpdate;

        }

        return didUpdate;

    }

}

class URDFMimicJoint extends URDFJoint {

    constructor(...args) {

        super(...args);
        this.type = 'URDFMimicJoint';
        this.mimicJoint = null;
        this.offset = 0;
        this.multiplier = 1;

    }

    updateFromMimickedJoint(...values) {

        const modifiedValues = values.map(x => x * this.multiplier + this.offset);
        return super.setJointValue(...modifiedValues);

    }

    /* Overrides */
    copy(source, recursive) {

        super.copy(source, recursive);

        this.mimicJoint = source.mimicJoint;
        this.offset = source.offset;
        this.multiplier = source.multiplier;

        return this;

    }

}

class URDFRobot extends URDFLink {

    constructor(...args) {

        super(...args);
        this.isURDFRobot = true;
        this.urdfNode = null;

        this.urdfRobotNode = null;
        this.robotName = null;

        this.links = null;
        this.joints = null;
        this.colliders = null;
        this.visual = null;
        this.frames = null;

    }

    copy(source, recursive) {

        super.copy(source, recursive);

        this.urdfRobotNode = source.urdfRobotNode;
        this.robotName = source.robotName;

        this.links = {};
        this.joints = {};
        this.colliders = {};
        this.visual = {};

        this.traverse(c => {

            if (c.isURDFJoint && c.urdfName in source.joints) {

                this.joints[c.urdfName] = c;

            }

            if (c.isURDFLink && c.urdfName in source.links) {

                this.links[c.urdfName] = c;

            }

            if (c.isURDFCollider && c.urdfName in source.colliders) {

                this.colliders[c.urdfName] = c;

            }

            if (c.isURDFVisual && c.urdfName in source.visual) {

                this.visual[c.urdfName] = c;

            }

        });

        this.frames = {
            ...this.colliders,
            ...this.visual,
            ...this.links,
            ...this.joints,
        };

        return this;

    }

    getFrame(name) {

        return this.frames[name];

    }

    setJointValue(jointName, ...angle) {

        const joint = this.joints[jointName];
        if (joint) {

            return joint.setJointValue(...angle);

        }

        return false;
    }

    setJointValues(values) {

        let didChange = false;
        for (const name in values) {

            const value = values[name];
            if (Array.isArray(value)) {

                didChange = this.setJointValue(name, ...value) || didChange;

            } else {

                didChange = this.setJointValue(name, value) || didChange;

            }

        }

        return didChange;

    }

}

export { URDFRobot, URDFLink, URDFJoint, URDFMimicJoint, URDFVisual, URDFCollider };
