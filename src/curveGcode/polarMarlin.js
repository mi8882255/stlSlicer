module.exports = {
    convert: (pathDown, pathUp) => {
        const dec2pol = (dot)=>{
            return {
                x: dot[0],
                y: dot[1],
                a: Math.atan2(dot[0], dot[1]),
                r: Math.hypot(dot[0], dot[1])
            }
        };

        const pathDownWithPolarObj = pathDown.reduce((acc,el) => {
            const elWithPolar = dec2pol(el);
            acc[elWithPolar.a] = elWithPolar;
            return acc;
        }, {})
        const pathUpWithPolarObj = pathUp.reduce((acc,el) => {
            const elWithPolar = dec2pol(el);
            acc[elWithPolar.a] = elWithPolar;
            return acc;
        }, {})
        
        const allAnglesSorted = Object.keys({...pathDownWithPolarObj, ...pathUpWithPolarObj}).sort();
        //set const steps by radius, step by angle
        //add to dec polar coords and write to object
        //add dots from opposite
        //sort angles
        //for each angle calculate diff to next and write G-code to array

        const searchPrevNext = (path, sortedDots, currentIndex) => {
            
        }

        for (let angle of allAnglesSorted) {
            let upDot= 
            let downDot=
        }

    }
}