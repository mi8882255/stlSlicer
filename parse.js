const StlLib = require("stl");
const fs = require("fs");

var facets = StlLib.toObject(fs.readFileSync('./example_stl/original_duck.stl'));

//cut by plane

const getLayerTriangles = (facets, planeZ) => {
    const f4cutArray=[];
    for (const el of facets.facets) {
        let allOneSide = false;
        const zCoordsToPlane = el.verts.map(f => f[2] > planeZ);
        if ((zCoordsToPlane[0] === zCoordsToPlane[1])
            && (zCoordsToPlane[0] === zCoordsToPlane[2])
            && (zCoordsToPlane[1] === zCoordsToPlane[2])
        ) {
            allOneSide = true;
        }
    
        if(!allOneSide) {
            f4cutArray.push([el.verts,zCoordsToPlane]);
        }
    }

    return f4cutArray;
}

const getPathLines = (facets, planeZ) => {
    const f4cutArray = getLayerTriangles(facets, planeZ);
    const pathLines = [];

    // we know that two lines intersect plane ... coz triangle
    // [2,3,-4] [5,7,6] z=1 => X E [~2..5, ~3..7]
    // dzMinMax = (upZ - downZ) => 6 -(-4) = 10 ; 
    // dzMinSet = (setZ - downZ) => 1 -(-4) = 5 ; 
    // kZ = dzMinSet/dzMinMax => 10/5 = 0,5
    // deltaCoord =  (upC - downC) => 5 - 2 = 3;
    // Coord = downCooord + (deltaCoord*kZ)

    const getKz = (upZ, downZ, setZ) => ((upZ - downZ)!==0)
        ?(setZ - downZ)/(upZ - downZ) 
        :0

    const getPathPoint = (upPoint, downPoint) => {
    const pKz = getKz(upPoint[2], downPoint[2], planeZ);
    const x = downPoint[0] + ((upPoint[0] - downPoint[0]) * pKz);
    const y = downPoint[1] + ((upPoint[1] - downPoint[1]) * pKz);
    const pathPoint = [x,y];

    if (x>50) console.log({upPoint, downPoint, pKz, x, y})
    return pathPoint
    }

    for (const [el,zCoordsToPlane] of f4cutArray) {
        // point in another side of plane
        const zCoords = el.map(f => f[2])
        const twoPointsUp = zCoords.reduce((acc, el)=> acc + (el>planeZ?1:0), 0) === 2
        const points = [...el].sort((a,b) => (a[2] - b[2]));

        // make 4 points(2up, 2down)
        if (!twoPointsUp) {
            points.push(points[2])
        } else {
            points.unshift(points[0])
        }

        //getPathPoint = (point1, point2)
        const pathPoint1 = getPathPoint(points[2], points[0]);
        const pathPoint2 = getPathPoint(points[3], points[1]);

        pathLines.push([pathPoint1, pathPoint2])

        // console.log({el, points, pathPoint1, pathPoint2})
        // process.exit();
        if (pathPoint1[0]>50 || pathPoint1[1]>50 || pathPoint2[0]>50 || pathPoint2[1]>50) {
            console.log({el, points, pathPoint1, pathPoint2, twoPointsUp, zCoordsToPlane})
            // process.exit();
        }
    }
    return pathLines;
}

// pathLinesToPathCurve
const pathLinesToPathCurve = (pathLine, zeroAngle)=> {
    const pathCurve = [];
    //divide points by x, if in one place by y => connect

    return pathCurve
}

// console.log(f4cutArray.length);
const layers = [];
for (let i=0; i<100; i=i+5) {
    const pathLines = getPathLines(facets, i);
    layers.push(pathLines)
}

console.log('const layers = ' + JSON.stringify(layers));

