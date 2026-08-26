using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CardGameStore.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260826130000_AddCentralFiscalNoteReference")]
public partial class AddCentralFiscalNoteReference : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>(
            name: "central_fiscal_note_id",
            table: "notas_fiscais_emitidas",
            type: "uuid",
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "central_fiscal_payload_json",
            table: "notas_fiscais_emitidas",
            type: "text",
            nullable: true);

        migrationBuilder.CreateIndex(
            name: "ix_notas_fiscais_central_note",
            table: "notas_fiscais_emitidas",
            column: "central_fiscal_note_id",
            unique: true,
            filter: "central_fiscal_note_id IS NOT NULL");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "ix_notas_fiscais_central_note",
            table: "notas_fiscais_emitidas");

        migrationBuilder.DropColumn(
            name: "central_fiscal_note_id",
            table: "notas_fiscais_emitidas");

        migrationBuilder.DropColumn(
            name: "central_fiscal_payload_json",
            table: "notas_fiscais_emitidas");
    }
}
