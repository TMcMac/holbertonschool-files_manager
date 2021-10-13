import { ObjectID } from 'mongodb';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class FilesController {
  static async postUpload(req, res) {
    const token = req.headers['x-token'];
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { name, type, data } = req.body;
    let { parentId, isPublic } = req.body;
    const files = await dbClient.db.collection('files');
    let resultObj;

    if (!name) return res.status(400).json({ error: 'Missing name' });
    if (!type || ['folder', 'file', 'image'].indexOf(type) === -1) {
      return res.status(400).json({ error: 'Missing type' });
    }
    if (!parentId) parentId = 0;
    else {
      const parentFileArr = await files.find({ _id: ObjectID(parentId) }).toArray();
      if (parentFileArr.length === 0) return res.status(400).json({ error: 'Parent not found' });
      const file = parentFileArr[0];
      if (file.type !== 'folder') return res.status(400).json({ error: 'Parent is not a folder' });
    }
    if (!isPublic) isPublic = false;
    if (!data && type !== 'folder') return res.status(400).json({ error: 'Missing data' });
    if (type !== 'folder') {
      const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
      if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath);

      const fileUUID = uuidv4();
      const localFilePath = `${folderPath}/${fileUUID}`;
      const saveData = Buffer.from(data, 'base64');
      await fs.promises.writeFile(localFilePath, saveData.toString(), { flag: 'w+' });

      resultObj = await files.insertOne({
        userId: ObjectID(userId),
        name,
        type,
        isPublic,
        parentId: parentId === 0 ? parentId : ObjectID(parentId),
        localFilePath,
      });
      if (type === 'image') {
        await fs.promises.writeFile(localFilePath, saveData, { flag: 'w+', encoding: 'binary' });
      }
    } else {
      resultObj = await files.insertOne({
        userId: ObjectID(userId),
        name,
        type,
        isPublic,
        parentId: parentId === 0 ? parentId : ObjectID(parentId),
      });
    }
    return res.status(201).json({
      id: resultObj.ops[0]._id, userId, name, type, isPublic, parentId,
    });
  }
}

export default FilesController;
