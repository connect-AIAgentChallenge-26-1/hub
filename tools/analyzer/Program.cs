using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

if (args.Length < 1)
{
    Console.Error.WriteLine("Usage: analyzer <folder-path> | analyzer --validate-syntax | analyzer --analyze-content");
    Environment.Exit(1);
    return;
}

// Separate from the class/dependency extraction below — reads a single
// file's source from stdin and reports only whether it parses (Syntax-only,
// same principle as the folder analysis: no compilation, no type checking).
if (args[0] == "--validate-syntax")
{
    var source = Console.In.ReadToEnd();
    var tree = CSharpSyntaxTree.ParseText(source);
    var errors = tree.GetDiagnostics()
        .Where(d => d.Severity == DiagnosticSeverity.Error)
        .Select(d => d.ToString())
        .ToList();

    Console.WriteLine(JsonSerializer.Serialize(new { valid = errors.Count == 0, errors }));
    return;
}

// v8: lightweight structural read of a handful of in-memory files (e.g. a
// single Step's generated file-changes) — same per-class extraction as the
// folder scan below, just fed via stdin JSON instead of walking a directory,
// so callers never need to write anything to disk or re-clone a repo.
if (args[0] == "--analyze-content")
{
    var inputJson = Console.In.ReadToEnd();
    var inputFiles = JsonSerializer.Deserialize<List<ContentInput>>(inputJson) ?? new List<ContentInput>();
    var contentClassResults = new List<object>();

    foreach (var file in inputFiles)
    {
        try
        {
            contentClassResults.AddRange(ExtractClasses(file.content, file.path));
        }
        catch
        {
            // One unparseable file shouldn't abort the whole request — skip it.
            continue;
        }
    }

    Console.WriteLine(JsonSerializer.Serialize(new { classes = contentClassResults }));
    return;
}

var targetPath = args[0];
var classResults = new List<object>();

if (Directory.Exists(targetPath))
{
    foreach (var filePath in Directory.EnumerateFiles(targetPath, "*.cs", SearchOption.AllDirectories))
    {
        try
        {
            var sourceText = File.ReadAllText(filePath);
            var relativePath = Path.GetRelativePath(targetPath, filePath).Replace('\\', '/');
            classResults.AddRange(ExtractClasses(sourceText, relativePath));
        }
        catch
        {
            // One unreadable/malformed file shouldn't abort the whole analysis run — skip it.
            continue;
        }
    }
}

Console.WriteLine(JsonSerializer.Serialize(new { classes = classResults }));

// Shared by both the folder scan and --analyze-content: parses one file's
// source and extracts every class declaration's name/inheritance/dependency/
// method-count/namespace info. `path` is only ever used as a label on the
// output (relative path on disk for the folder scan, whatever path the
// caller supplied for in-memory content) — it isn't read from again.
static List<object> ExtractClasses(string sourceText, string path)
{
    var results = new List<object>();
    var root = CSharpSyntaxTree.ParseText(sourceText).GetRoot();

    foreach (var classDecl in root.DescendantNodes().OfType<ClassDeclarationSyntax>())
    {
        var baseTypes = classDecl.BaseList?.Types
            .Select(t => t.Type.ToString())
            .ToList() ?? new List<string>();

        // "Referenced types" only approximates dependencies from identifiers used inside
        // the class body (methods/fields/properties) — Syntax-only analysis can't tell a
        // type name apart from a variable or method call with the same identifier text.
        var referencedTypes = classDecl.Members
            .SelectMany(member => member.DescendantNodes().OfType<IdentifierNameSyntax>())
            .Select(id => id.Identifier.Text)
            .Distinct()
            .ToList();

        var methodCount = classDecl.Members.OfType<MethodDeclarationSyntax>().Count();

        // BaseNamespaceDeclarationSyntax covers both classic (`namespace X {}`)
        // and file-scoped (`namespace X;`) declarations — v5 needs this so the
        // Code Generation Agent can detect and follow the repo's real
        // namespace convention instead of guessing one.
        var namespaceName = classDecl.Ancestors()
            .OfType<BaseNamespaceDeclarationSyntax>()
            .FirstOrDefault()?.Name.ToString() ?? "";

        results.Add(new
        {
            name = classDecl.Identifier.Text,
            filePath = path,
            baseTypes,
            referencedTypes,
            methodCount,
            namespaceName,
        });
    }

    return results;
}

record ContentInput(string path, string content);
