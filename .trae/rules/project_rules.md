# 项目规则

## Git 提交规则

### Push 前必须 Pull
- **push 之前必须先执行 `git pull`**（或 `git pull --rebase`），确认远程没有新提交，防止冲突。
- 如果发现冲突，先解决冲突并确认代码正常后再 push。

### Commit Message 规范
- 使用 `git-commit-message` 格式。
- 按功能拆分 commit，每个 commit 只做一件事。
- 常用前缀：
  - `feat()`：新功能
  - `fix()`：Bug 修复
  - `refactor()`：重构
  - `chore()`：杂项/配置
  - `style()`：样式调整
  - `docs()`：文档
