# 业务逻辑文档：智能代码知识服务平台

## 项目概述

本系统是一个面向代码知识管理的智能服务平台，采用微服务架构，通过六大核心服务的协同工作，实现从代码索引构建、知识检索、智能问答到文档自动生成的完整业务流程。服务的协作方式遵循“索引先行、检索支撑、问答驱动、文档输出”的流水线模式：`ScanService`与`UpdateService`负责代码变更感知，`IndexService`完成知识结构化存储，`RetrievalService`提供语义级检索能力，`QAService`基于检索结果进行智能推理，最终由`WikiService`生成可读性文档。所有服务无外部依赖，通过方法调用形成内聚的业务闭环。

## 核心服务详解

### 1. IndexService（索引服务）
**核心职责**：将代码文件转换为可检索的知识单元，是系统的数据基石。负责读取项目文件内容，解析代码结构（如符号定义、代码块），并将这些信息拆分为文档、符号和块三种粒度的索引条目，分别存储到结构化数据仓库中。关键方法`init`完成索引环境初始化，`indexProject`串联读取-解析-存储全流程，`insertDocument`/`insertSymbol`/`insertChunk`分别处理不同粒度的结构化录入，`extractLines`用于精准定位代码片段的行号范围。

### 2. QAService（问答服务）
**核心职责**：提供智能问答能力，是系统的交互入口。基于用户问题，通过`ask`方法启动问答流程，内部调用`retrieve`获取相关代码上下文，`buildContext`组装结构化提示信息，`buildReferences`生成可追溯的引用来源，最终`generateAnswer`通过大语言模型生成自然语言回答。`askStream`支持流式输出，提升用户体验。该服务不直接访问索引，而是依赖`RetrievalService`完成信息提取。

### 3. RetrievalService（检索服务）
**核心职责**：实现语义级代码检索，是问答与文档生成的支撑引擎。`retrieve`方法接收查询意图，通过`searchByIntent`进行多策略混合检索（包括关键词匹配与语义向量搜索），`convertSymbolResult`将符号级搜索结果转换为统一的检索结果格式，`lookupSymbolContent`精确定位符号定义的具体代码内容。返回的结果包含代码片段、文件路径、行号等结构化信息，供上游服务使用。

### 4. ScanService（扫描服务）
**核心职责**：监测项目源码变化，是系统更新的触发者。提供极简接口`scan`，扫描指定目录下的所有代码文件，识别文件类型、大小、修改时间等元数据，生成待处理的文件列表。该服务不存储状态，每次扫描返回全量或增量的文件变更集合，供`UpdateService`进行精细化处理。

### 5. UpdateService（更新服务）
**核心职责**：管理索引的增量更新，保障知识库的时效性。`detectChangedFiles`对比文件快照检测新增、修改、删除的文件，`detectChangedFilesSince`支持基于时间戳的变更检测，`incrementalUpdate`根据变更类型调用`IndexService`对应的插入、更新或删除操作。该服务与`ScanService`配合实现持续集成式的代码同步：扫描发现变更→更新服务计算差异→索引服务执行更新。

### 6. WikiService（文档生成服务）
**核心职责**：自动生成项目文档，是知识输出的最终呈现层。`buildWiki`驱动整体文档构建流程，`generatePage`为单个代码模块生成结构化文档页（包括概述、关键符号、调用关系等），`generateFallback`提供当LLM不可用时的规则化文档降级方案，`generateWithLlm`利用大语言模型生成上下文相关的高质量文档描述。该服务依赖`RetrievalService`获取代码语义信息，确保文档内容基于实际代码而非模板填充。

## 服务协作关系

1. **数据流上游**：`ScanService`→`UpdateService`→`IndexService`形成代码变更处理链。`ScanService`扫描文件，`UpdateService`鉴别变更类型，`IndexService`执行结构化存储，三者串行协作完成索引的构建与维护。

2. **核心查询链路**：`QAService`→`RetrievalService`→`IndexService`形成索引查询链。用户提问时，`QAService`调用`RetrievalService`进行语义检索，后者读取`IndexService`存储的文档/符号/块数据，返回结构化结果，最终由`QAService`生成回答。

3. **文档生成链路**：`WikiService`→`RetrievalService`→`IndexService`形成文档输出链。需要生成文档时，`WikiService`通过`RetrievalService`获取代码元素的语义描述和关联信息，利用LLM或规则引擎生成文档页面，文档内容可直接溯源到索引中的原始代码块。

4. **闭环协同**：当`WikiService`生成文档时，若发现需要补充索引中缺失的符号信息，可触发`IndexService`进行补充索引；同时，`QAService`生成的问答内容也可回馈给`WikiService`作为文档素材，形成“索引-问答-文档”的双向数据流转。