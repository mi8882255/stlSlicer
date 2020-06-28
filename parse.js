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

const getPathLinesObj = (facets, planeZ) => {
    let minLineLength; //not real only max axis projection
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
        const maxAxisProjection = Math.max(Math.abs(pathPoint1[0]-pathPoint2[0]),Math.abs(pathPoint1[1]-pathPoint2[1]))
        minLineLength = Math.min(
            minLineLength || maxAxisProjection,
            maxAxisProjection
            )
        pathLines.push([pathPoint1, pathPoint2])

        // console.log({el, points, pathPoint1, pathPoint2})
        // process.exit();
        if (pathPoint1[0]>50 || pathPoint1[1]>50 || pathPoint2[0]>50 || pathPoint2[1]>50) {
            console.log({el, points, pathPoint1, pathPoint2, twoPointsUp, zCoordsToPlane})
            // process.exit();
        }
    }
    return {pathLines, minLineLength};
}

const pathLinesToPathCurve3 = (pathLinesObj)=> {
    const {pathLines, minLineLength} = pathLinesObj

    const precisionMinLen = (minLineLength / 10);
    let precision = 1;
    for (let i=0; i<30; i++) {
        precision = precision+1;
        if (precisionMinLen > (1/(10**precision))) {break;}
    }
    precision++;

    // console.log({precision,minLineLength})

    const dlPathLines = pathLines.map(line => [line, null, null, false]);
    const isPointsEqual = (p1,p2) => 
        (+p1[0]).toPrecision(precision) === (+p2[0]).toPrecision(precision)
        && (+p1[1]).toPrecision(precision) === (+p2[1]).toPrecision(precision);

    for (const i in dlPathLines) {
        const startPoint1 = pathLines[i][0];
        const endPoint1 = pathLines[i][1];
        if (isPointsEqual(startPoint1,endPoint1)) continue;

        for (const j in dlPathLines) {
            if (i==j) continue;

            const startPoint2 = pathLines[j][0];
            const endPoint2 = pathLines[j][1];
            if (isPointsEqual(startPoint2,endPoint2)) continue;
            // console.log(startPoint1,endPoint1,startPoint2,endPoint2)

            if (isPointsEqual(startPoint1, startPoint2)) {
                dlPathLines[i][1] = j;
                dlPathLines[j][1] = i;
            };

            if (isPointsEqual(startPoint1, endPoint2)) {
                dlPathLines[i][1] = j;
                dlPathLines[j][2] = i;
            };

            if (isPointsEqual(endPoint1, startPoint2)) {
                dlPathLines[i][2] = j;
                dlPathLines[j][1] = i;
            };

            if (isPointsEqual(endPoint1, endPoint2)) {
                dlPathLines[i][2] = j;
                dlPathLines[j][2] = i;
            };
        }
    }

    // console.log(dlPathLines);

    const getNextLineIndex = (lineIndex, prevIndex) => (dlPathLines[lineIndex][2]===prevIndex)
        ? dlPathLines[lineIndex][1]
        : dlPathLines[lineIndex][2];
    const hasNext = (lineIndex) => lineIndex!==null
    const notUsed = (lineIndex) => dlPathLines[lineIndex][3]!==true

    const makePath = (firstIndex) => {
        // const path=[];
        const pathDots=[];
        let prevIndex = firstIndex;
        // path.push(firstIndex)
        pathDots.push(dlPathLines[firstIndex][0][0])
        for (let lineIndex = getNextLineIndex(prevIndex);hasNext(lineIndex) && notUsed(lineIndex);) {
            dlPathLines[lineIndex][3] = true;

            // path.push(lineIndex)

            const nextLineIndex = getNextLineIndex(lineIndex, prevIndex)
            const nextDot =  (dlPathLines[lineIndex][0][0] === pathDots[pathDots.length-1])
                ? dlPathLines[lineIndex][0][1]
                : dlPathLines[lineIndex][0][0]
            pathDots.push(nextDot)
            prevIndex = lineIndex;
            lineIndex = nextLineIndex;
        }

        return pathDots;
    }

    const pathCurves = [];
    let j=0;
    for (let i in dlPathLines) {
        if (notUsed(i)) {
            pathCurves[j]=makePath(i);
            j++;
        }
    }

    // console.log(pathCurves[0][0],pathCurves[0][1],pathCurves[0][2],pathCurves[0][pathCurves[0].length-1]);

    // console.log(dlPathLines
    //     .map((el,i) => `${i}->(${el[1]}, ${el[2]})`).join(', ')
    //     )

    // console.log(dlPathLines
    //     .map((el,i) => [i, el[0][0][0], el[0][0][1],el[0][1][0], el[0][1][1]])
    //     .filter(el => el[1]>42.9 && el[1]<43 || el[3]>42.9 && el[3]<43)
    //     )
    // console.log(dlPathLines[13], dlPathLines[14])
    //188=>83

    return pathCurves;
}



// const pathLinesSimpleObj = getPathLinesObj(facets, 10)
// const pathLines = [
//     [[1.111,1],[2,3]], 
//     [[2,3],[4,5]], 
//     [[4,5],[4,10]], 
//     [[6,10],[1.111, 1]], 
//     [[4,10],[6,10]]
// ]
// const pathLinesSimpleObj = {
//     pathLines, 
//     minLineLength: 0.018
// }
// console.log(pathLinesToPathCurve3(pathLinesSimpleObj))

// console.log(f4cutArray.length);
const layers = [];
for (let i=0; i<100; i=i+5) {
    const pathLinesObj = getPathLinesObj(facets, i);
    layers.push(pathLinesToPathCurve3(pathLinesObj))
}

console.log('const layers = ' + JSON.stringify(layers));

