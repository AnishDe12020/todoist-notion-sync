import dotenv from "dotenv";
import fetch from "node-fetch";
import { Client } from "@notionhq/client";
import { TodoistApi } from "@doist/todoist-api-typescript";

dotenv.config();

const notion = new Client({ auth: process.env.NOTION_KEY });
const todoist = new TodoistApi(process.env.TODOIST_KEY);

// const TODOIST_URL = "https://api.todoist.com/rest/v1";
const PRIORITY_COLORS_MAP = {
	1: "red",
	2: "orange",
	3: "yellow",
};

const databaseId = process.env.NOTION_DATABASE_ID;

const todoistTaskIdToNotionPageId = {};

const setInitialTodoistToNotionMap = async () => {
	const tasksInNotion = await getTasksFromNotionDatabase();
	tasksInNotion.forEach(({ pageId, taskId }) => {
		todoistTaskIdToNotionPageId[taskId] = pageId;
	});
	console.log(todoistTaskIdToNotionPageId);
};

const syncNotionDatabaseWithTodoist = async () => {
	await setInitialTodoistToNotionMap();
	console.log("Getting tasks from Todoist...");
	const tasksInTodoist = await getActiveTasksFromTodoist();
	// console.log(tasksInTodoist);
	console.log(`Fetched ${tasksInTodoist.length} tasks from Todoist.`);

	const { pagesToCreate, pagesToUpdate } = await getNotionOperations(
		tasksInTodoist
	);

	console.log("----------------------------------------");
	console.log(`${pagesToCreate.length} tasks to create.`);
	console.log(`${pagesToUpdate.length} tasks to update.`);
	console.log("----------------------------------------");

	await createPages(pagesToCreate);
	console.log(`Added ${pagesToCreate.length} new tasks in Notion.`);

	await updatePages(pagesToUpdate);
	console.log(`Updated ${pagesToUpdate.length} tasks in Notion.`);
};

const getActiveTasksFromTodoist = async () => {
	// const todoistRes = await fetch(`${TODOIST_URL}/tasks`, {
	// 	method: "GET",
	// 	headers: {
	// 		Authorization: `Bearer ${process.env.TODOIST_KEY}`,
	// 	},
	// });

	// const todoistJSON = await todoistRes.json();

	try {
		const tasks = await todoist.getTasks();
		return tasks.filter(task => !task.parentId);
	} catch (err) {
		console.error(err);
		return err;
	}
};

const getTasksFromNotionDatabase = async () => {
	const pages = [];
	let cursor = undefined;

	while (true) {
		const { results, next_cursor } = await notion.databases.query({
			database_id: databaseId,
			cursor: cursor,
		});
		pages.push(...results);
		if (!next_cursor) {
			break;
		}

		cursor = next_cursor;
	}
	console.log(`${pages.length} tasks successfully fetched.`);

	return pages.map(page => {
		return {
			pageId: page.id,
			taskId: page.properties["Task ID"].number,
		};
	});
};

const getNotionOperations = async tasks => {
	const pagesToCreate = [];
	const pagesToUpdate = [];

	tasks.forEach(async task => {
		console.log(todoistTaskIdToNotionPageId);
		const pageId = todoistTaskIdToNotionPageId[task.id];
		console.log("----------------------------------------");
		console.log(`Task ${task.id} to pageId ${pageId}`);
		console.log("----------------------------------------");
		if (pageId) {
			pagesToUpdate.push(task);
		} else {
			pagesToCreate.push(task);
		}
	});

	return { pagesToCreate, pagesToUpdate };
};

const createPages = async pagesToCreate => {
	pagesToCreate.map(async task => {
		notion.pages.create({
			parent: { database_id: databaseId },
			properties: await getPropertiesFromTask(task),
		});
	});
	// console.log("Completed adding new tasks to Notion.");
};

const updatePages = async pagesToUpdate => {
	pagesToUpdate.map(async task => {
		const pageId = todoistTaskIdToNotionPageId[task.id];
		notion.pages.update({
			page_id: pageId,
			properties: await getPropertiesFromTask(task),
		});
	});
	// console.log("Completed updating tasks in Notion.");
};

const getLabelsFromTodoist = async labelId => {
	// const todoistRes = await fetch(`${TODOIST_URL}/labels/${labelId}`, {
	// 	method: "GET",
	// 	headers: {
	// 		Authorization: `Bearer ${process.env.TODOIST_KEY}`,
	// 	},
	// });
	// const todoistJSON = await todoistRes.json();
	// return todoistJSON;

	try {
		return await todoist.getLabel(labelId);
	} catch (err) {
		console.error(err);
		return err;
	}
};

const getPropertiesFromTask = async task => {
	console.log("----------------------");
	console.log(task);
	const { id, content, description, completed, labelIds, priority, due, url } =
		task;

	console.log(due);

	// console.log(
	// 	id,
	// 	content,
	// 	description,
	// 	completed,
	// 	label_ids,
	// 	priority,
	// 	due,
	// 	url
	// );

	// const e = await Promise.all(
	// 	label_ids.map(async labelId => {
	// 		const labelData = await getLabelsFromTodoist(labelId);
	// 		console.log(task.content, labelData.name);

	// 		return {
	// 			name: labelData.name,
	// 		};
	// 	})
	// );

	// console.log("eeeeeeeeeeee", e);

	return {
		"Task ID": {
			number: id,
		},
		Content: {
			title: [{ type: "text", text: { content: content } }],
		},
		Description: {
			rich_text: [
				{ type: "text", text: { content: description ? description : "" } },
			],
		},
		Tags: {
			multi_select:
				labelIds.length > 0
					? await Promise.all(
							labelIds.map(async labelId => {
								const labelData = await getLabelsFromTodoist(labelId);
								console.log(task.content, labelData.name);

								return {
									name: labelData.name,
								};
							})
					  )
					: [],
		},
		Priority: {
			select: {
				name: priority.toString(),
				// color: PRIORITY_COLORS_MAP[priority],
			},
		},
		"✅": {
			checkbox: completed,
		},
		"Due Date": {
			date: due ? { start: new Date(due.date) } : null,
		},
		URL: {
			url: url,
		},
	};
};

syncNotionDatabaseWithTodoist();
