const { readFileSync, statSync, readdirSync, existsSync, writeFileSync } = require('fs');
const readline = require('readline');
const path = require('path')

const args = process.argv.slice(2);
// validate parameter
const sourceFolder = args[0];
const packagesFolder = args[1];
if (!sourceFolder || !existsSync(sourceFolder)) {
    console.log(`Cannot find source folder for the package: ${sourceFolder}`);
    process.exit(1);
} else if (!packagesFolder || !existsSync(packagesFolder)) {
    console.log(`Cannot find packages folder for the package: ${packagesFolder}`);
    process.exit(1);
}

const PACKAGE_FOLDER = packagesFolder;
const updateMap = {};
const doneMap = {};
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const getPackageJson = (dir) => {
    const file = `${dir}/package.json`;
    if (existsSync(file)) {
        return JSON.parse(readFileSync(file));
    } else {
        console.log(`Cannot find ${file}.`);
        return {};
    }
};

const getFolders = p => readdirSync(PACKAGE_FOLDER).filter(f => statSync(path.join(p, f)).isDirectory());

const propagateNewVersion = (name, version, folders = []) => {
    const newList = [];
    folders.forEach((dir) => {
        const packageJson = getPackageJson(dir);
        const { dependencies = {}, name: packageName, version: packageVersion } = packageJson;
        // if the package is the target package we are going to upgrade
        if (name === packageName && version !== packageVersion) {
            // update the package.json file
            packageJson.version = version;

            // save to disk
            console.log(`Saving ${name}, ${packageVersion} => ${version}`);
            writeFileSync(`${dir}/package.json`, JSON.stringify(packageJson, null, '  '));            
        }

        // if the package is in dependencies, then udpate that
        const existingVersion = dependencies[name];
        if (existingVersion && existingVersion !== version && !doneMap[packageName]) {
            // update the depency value
            packageJson.dependencies[name] = version;

            // add to the updateMap so that it can be queued
            updateMap[packageName] = packageVersion;

            // ask to bump up version
            newList.push(packageName);

            // save to disk
            console.log(`Update dependency ${name} from ${packageName}, ${existingVersion} => ${version}`);
            writeFileSync(`${dir}/package.json`, JSON.stringify(packageJson, null, '  '));
        }
    });

    // add the package to done
    doneMap[name] = updateMap[name];
    // remove the updateMap to avoid process it again
    delete updateMap[name];

    return newList;
};

const readFromConsole = (packageName, lastVersion) => {
    return new Promise((resolve) => {
        rl.question(`Input new version for ${packageName}: [${lastVersion}] `, (answer) => {
            if (!answer) {
                resolve(lastVersion);
            } else {
                resolve(answer);
            }
        });    
    });
}

async function bumpUpVersion(packageList = []) {
    let newList = [];

    for (let packageName of packageList) {
        const packageFolders = getFolders(PACKAGE_FOLDER);
        const version = await readFromConsole(packageName, updateMap[packageName]);
        newList = newList.concat(propagateNewVersion(packageName, version, packageFolders.map((dir) => `${PACKAGE_FOLDER}/${dir}`)));
    }

    if (newList.length > 0) {
        return bumpUpVersion(newList);
    } else {
        return Promise.resolve();
    }
};

const main = () => {
    
    // read the package.json from current directory
    const packageJson = getPackageJson(sourceFolder);

    if (!packageJson) {
        console.log('Failed to read package.json. Please run the command in the package folder');
        process.exit(1);
    }

    // get the package name and version number
    const { name, version } = packageJson;

    if (!name || !version) {
        console.log('Cannot read package name and version');
        process.exit(1);
    }

    // add it to the updateMap as the todo item
    updateMap[name] = version;
    bumpUpVersion([name]).then(() => rl.close());
}

main();